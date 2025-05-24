
let file = 'data/sleeves.json';
let fileGlobal = 'data/globals.json';
let globals = {} as Globals
let sleevesData: SleeveData = { snapShotTime: 0, sleeves: [] };
import { run } from './autoPlay'

// for now this is only used to take snapshots to gauge if any progress is being made
export type SleeveData = {
    snapShotTime: number,
    sleeves: SleevePerson[]
}
let factionsWorkingFor: string[] = []
export async function main(ns: NS) {
    sleevesData = JSON.parse(ns.read(file) === '' ? '{}' : ns.read(file));
    if (Object.keys(sleevesData).length === 0) {
        sleevesData = { snapShotTime: 0, sleeves: [] };
    }
    let numberSleeves = ns.sleeve.getNumSleeves();
    // as only one sleeve can work for a faction store this
    factionsWorkingFor = [];
    // first unassign all factions from working hacking, so that sleeves can be divided correctly among them
    for (let i = 0; i < numberSleeves; i++) {
        switchOffFactionWork(ns, i);
    }

    let startingMoney = ns.getServerMoneyAvailable('home');
    globals = JSON.parse(ns.read(fileGlobal));
    for (let i = 0; i < numberSleeves; i++) {
        let isSynchronizing = synchronize(ns, i);
        if (isSynchronizing) {
            continue;
        }
        // when trying to join gang do not reset stats
        if (!globals.startGang || ns.gang.inGang()) {
            buyAugments(ns, i, 0.1 * startingMoney);
        }
        /* restoring shock is very slow, probably not needed unless very difficult bitnode
        let isInShockRecovery = lowerShock(ns, i);
        if (isInShockRecovery) {
            continue;
        }*/
        if (globals.startGang && !ns.gang.inGang()) {
            let readyForHomicide = trainTillHomicide(ns, i);
            ns.sleeve.setToCommitCrime(i, ns.enums.CrimeType.homicide);
        }
        let doTrainHacking = trainHacking(ns, i);
        if (doTrainHacking) {
            continue;
        }

        let workForFaction = workHackingForFaction(ns, i)
        if (workForFaction) {
            continue;
        }
        trainHacking(ns, i, true)
    }

    writeSleevesData(ns);
}

/**
 * sets a sleeve to shock recovery if above a hardcoded threshold
 * returns TRUE if set to shock recovery
 */
export function lowerShock(ns: NS, sleeve: number) {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    if (sleevePerson.shock > 0) {
        return ns.sleeve.setToShockRecovery(sleeve);
    }
    return false;
}


/**
 *
 * Trains the sleeve untill its considered to be available for homicide (50 all skills)
 * Returns TRUE if the stats are reached
 */
export function trainTillHomicide(ns: NS, sleeve: number) {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    if (sleevePerson.skills.strength < 50) {
        trainCombatSkill(ns, sleeve, 'str');
    }
    else if (sleevePerson.skills.defense < 50) {
        trainCombatSkill(ns, sleeve, 'def');
    }
    else if (sleevePerson.skills.dexterity < 50) {
        trainCombatSkill(ns, sleeve, 'dex');
    }
    else if (sleevePerson.skills.agility < 50) {
        trainCombatSkill(ns, sleeve, 'agi');
    }
    else {
        return true;
    }
    return false;
}

export function trainCombatSkill(ns: NS, sleeve: number, skill: 'str' | 'def' | 'dex' | 'agi') {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    if (sleevePerson.city !== ns.enums.CityName.Sector12) {
        ns.sleeve.travel(sleeve, ns.enums.CityName.Sector12);
    }
    switch (skill) {
        case 'str':
            ns.sleeve.setToGymWorkout(sleeve, ns.enums.LocationName.Sector12PowerhouseGym, ns.enums.GymType.strength);
            break;
        case 'def':
            ns.sleeve.setToGymWorkout(sleeve, ns.enums.LocationName.Sector12PowerhouseGym, ns.enums.GymType.defense);
            break;
        case 'dex':
            ns.sleeve.setToGymWorkout(sleeve, ns.enums.LocationName.Sector12PowerhouseGym, ns.enums.GymType.dexterity);
            break;
        case 'agi':
            ns.sleeve.setToGymWorkout(sleeve, ns.enums.LocationName.Sector12PowerhouseGym, ns.enums.GymType.agility);
            break;
    }
}

/**
 *
 * Trains hacking untill no progress is made. if overwrite = true then always train
 */
export function trainHacking(ns: NS, sleeve: number, overwrite = false) {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    if (overwrite || isHackingProgressMade(ns, sleeve)) {
        if (sleevePerson.city !== ns.enums.CityName.Volhaven) {
            ns.sleeve.travel(sleeve, ns.enums.CityName.Volhaven);
        }
        ns.sleeve.setToUniversityCourse(sleeve, ns.enums.LocationName.VolhavenZBInstituteOfTechnology, ns.enums.UniversityClassType.algorithms)
        return true;
    }
    return false;
}


/**
 * Returns TRUE if any progress is being made in hacking compared to previous snapshot
 */
export function isHackingProgressMade(ns: NS, sleeve: number) {
    let currentSleeve = ns.sleeve.getSleeve(sleeve);
    if (sleevesData.sleeves[sleeve] === undefined
        || (sleevesData.sleeves[sleeve]?.skills.hacking < currentSleeve.skills.hacking)
        || (totalAugmentMultiplier(ns, sleevesData.sleeves[sleeve]) < totalAugmentMultiplier(ns, currentSleeve))) {
        return true;
    }
    else {
        return false;
    }
}

/**
 * Returns the total augment multiplier of the sleeve
 * The total number does not say a lot, but can be used to check if any new augments have been added
 */
export function totalAugmentMultiplier(ns: NS, sleevePerson: SleevePerson) {
    let mults = sleevePerson.mults;
    return Object.values(mults).reduce((sum, mult) => sum + mult, 0)
}


/**
 * Trains the lowest combat skill of the sleeve
 */
export function trainLowestCombatSkill(ns: NS, sleeve: number) {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    let lowestSkill: 'str' | 'def' | 'dex' | 'agi' = 'str';
    let lowestValue = sleevePerson.skills.strength;
    if (sleevePerson.skills.defense < lowestValue) {
        lowestSkill = 'def';
        lowestValue = sleevePerson.skills.defense;
    }
    if (sleevePerson.skills.dexterity < lowestValue) {
        lowestSkill = 'dex';
        lowestValue = sleevePerson.skills.dexterity;
    }
    if (sleevePerson.skills.agility < lowestValue) {
        lowestSkill = 'agi';
        lowestValue = sleevePerson.skills.agility;
    }
    trainCombatSkill(ns, sleeve, lowestSkill);
}

/**
 *
 * Set to work hacking for any faction with unowned (player) augments
 * Returns TRUE if the sleeve started working for any such faction
 */
function workHackingForFaction(ns: NS, sleeve: number) {
    let ownedAugments = ns.singularity.getOwnedAugmentations();
    for (const faction of ns.getPlayer().factions) {
        if (factionsWorkingFor.includes(faction)) {
            continue;
        }
        let repOfFaction = ns.singularity.getFactionRep(faction);
        if (ns.singularity.getAugmentationsFromFaction(faction).some((a) => (!ownedAugments.includes(a) && ns.singularity.getAugmentationRepReq(a) >= repOfFaction))) {
            // this will return false if another sleeve is already working for the faction
            if (ns.sleeve.setToFactionWork(sleeve, faction, ns.enums.FactionWorkType.hacking)) {
                factionsWorkingFor.push(faction);
                return true;
            }
        }
    }
    return false;
}

export function switchOffFactionWork(ns: NS, sleeve: number) {
    ns.sleeve.getSleeve(sleeve);
    let task = ns.sleeve.getTask(sleeve);
    if (task?.type === "FACTION") {
        // do not set to idle because currently that option is not included anywhere hence this saves that ram cost
        ns.sleeve.setToShockRecovery(sleeve);
    }
}


/**
 *
 * buys all augments available up to the input limit money
 */
export function buyAugments(ns: NS, sleeve: number, limit?: number) {
    if (ns.sleeve.getSleeve(sleeve).shock > 0) {
        return;
    }
    // TODO easy logic for now, cost is probably not an issue but buying an augment resets the stats, so maybe there a change would be better
    let augmentsToBuy = ns.sleeve.getSleevePurchasableAugs(sleeve);
    for (const augmentToBuy of augmentsToBuy) {
        if (limit === undefined || augmentToBuy.cost) {
            ns.sleeve.purchaseSleeveAug(sleeve, augmentToBuy.name);
        }
    }
}

/**
 * Sets a sleeves activity to synchronize if sync is below 100
 * Returns TRUE if the activity is set to synchronize
 */
export function synchronize(ns: NS, sleeve: number) {
    const sleevePerson = ns.sleeve.getSleeve(sleeve);
    if (sleevePerson.sync < 100) {
        ns.sleeve.setToSynchronize(sleeve);
        return true;
    }
    return false;
}

export function writeSleevesData(ns: NS) {
    let currentTime = Date.now();
    // make snapshot every minute
    // we use it only for now to gauge progress, if no levels have been changed for 1 minute consider it no progress
    if (currentTime - sleevesData.snapShotTime > 60 * 1000) {

        sleevesData.snapShotTime = currentTime;
        sleevesData.sleeves = [];
        for (let i = 0; i < ns.sleeve.getNumSleeves(); i++) {
            let sleevePerson = ns.sleeve.getSleeve(i);
            sleevesData.sleeves.push(sleevePerson)
        }
    }

    ns.write(file, JSON.stringify(sleevesData), 'w');
}