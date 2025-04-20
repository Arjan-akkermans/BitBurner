const file = 'data/manageGang.json';
const names = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];

type GangData = {
  Members?: {
    Name: string;
    PreviousTask: string;
    PreviousTaskStart: number;
    StartTrainingSinceAscend: number;
  }[]
};
let data = {} as GangData;
let currentTime = new Date().getTime();
let minWinChanceThreshold = 0.6

export async function main(ns: NS) {
  data = JSON.parse((ns.read(file) === '') ? '{}' : ns.read(file)) as GangData;
  if (data.Members === undefined) {
    data.Members = [];
  }

  if (!getCreateInGang(ns)) {
    return
  }

  let counter = 0;
  while (ns.gang.canRecruitMember() && counter < 100) {
    counter++
    recruitMember(ns);
  }

  let members = ns.gang.getMemberNames();
  // TODO  cleanupData(ns);



  let respectTillNextMember = ns.gang.respectForNextRecruit();
  for (const member of members) {
    // add member to data 
    if (!data.Members.some((memberInData) => memberInData.Name === member)) {
      data.Members.push({
        Name: member,
        PreviousTaskStart: currentTime,
        PreviousTask: 'Unassigned',
        StartTrainingSinceAscend: currentTime
      })
    }

    let memberInformation = ns.gang.getMemberInformation(member);

    // ensure member trains for at least 5 minutes since last ascencion
    const i = data.Members?.findIndex((memberData) => memberData.Name === member) ?? -1;
    if (i !== -1) {
      if (data.Members[i].PreviousTask === 'Train Combat'
        && (currentTime - data.Members[i].StartTrainingSinceAscend) < 1000 * 60 * 5
      ) {
        trainMember(ns, memberInformation);
        continue;
      }

      // always train member far behind the current strongest
      let highestStrenght = ns.gang.getMemberInformation(getStrongestMember(ns)).str;
      if (highestStrenght > 2 * memberInformation.str) {
        trainMember(ns, memberInformation);
        continue;
      }

      let minRep = respectTillNextMember / 100000;
      // drop wanted first as it decreases all other activities
      if (!dropWanted(ns, memberInformation))
        // get respect if it is 'soon' to a new member can be recruited
        if (!getRespect(ns, memberInformation, minRep)) {
          // otherwise get money (if specific value can be gotten???)
          if (!assignTerritory(ns, memberInformation)) {
            let thresholdMoneyGain = 100//(currentTime - data.Members[i].PreviousTaskStart) * 10000;
            // threshold based on previous task start, such that we eventually switch
            if (!getMoney(ns, memberInformation, thresholdMoneyGain)) { // getMoneyOrRespect??? this should at least be switched occasionally?
              if (!getRespect(ns, memberInformation, thresholdMoneyGain / 10)) {
                trainMember(ns, memberInformation);
              }
            }
          }
        }
    }
  }
  buyEquipment(ns, members);

  ns.gang.setTerritoryWarfare(getMinWinChance(ns) >= minWinChanceThreshold)

  ns.write(file, JSON.stringify(data), 'w');
}
export function trainMember(ns: NS, member: GangMemberInfo) {
  // ascend member if conditions are met
  ascendMember(ns, member);
  assignTask(ns, member.name, 'Train Combat');;
}

export function getRespect(ns: NS, member: GangMemberInfo, minRepPerTick: number) {
  let taskNames = ns.gang.getTaskNames();
  let gang = ns.gang.getGangInformation();
  let maxRep = 0;
  let taskName = '';
  for (const task of taskNames) {
    let repOfTask = ns.formulas.gang.respectGain(gang, member, ns.gang.getTaskStats(task));
    if (repOfTask > maxRep) {
      maxRep = repOfTask;
      taskName = task;
    }
  }
  if (maxRep >= minRepPerTick) {
    return assignTask(ns, member.name, taskName);
  }
  return false;
}

export function getMoney(ns: NS, member: GangMemberInfo, minMoneyPerTick: number) {
  // get rep first for buying augments
  if (ns.singularity.getFactionRep(ns.gang.getGangInformation().faction) < 3000000) {
    return
  }
  let taskNames = ns.gang.getTaskNames();
  let gang = ns.gang.getGangInformation();
  let maxMoney = 0;
  let taskName = '';
  for (const task of taskNames) {
    let moneyOfTask = ns.formulas.gang.moneyGain(gang, member, ns.gang.getTaskStats(task));
    if (moneyOfTask > maxMoney) {
      maxMoney = moneyOfTask;
      taskName = task;
    }
  }
  if (maxMoney >= minMoneyPerTick) {
    return assignTask(ns, member.name, taskName);
  }
  return false;
}

export function dropWanted(ns: NS, member: GangMemberInfo) {

  const gangInformation = ns.gang.getGangInformation();
  // if wanted is low just get some respect, it also lowers wanted and has more benefits
  if (gangInformation.wantedLevel < 100 && gangInformation.wantedPenalty > 0.10) {
    getRespect(ns, member, 1);
  }

  let wantedThreshold = 9 * gangInformation.respect // penalty =  this.respect / (this.respect + this.wanted);
  // threshold such that penalty is at most 10%
  if (ns.gang.getGangInformation().wantedLevel > wantedThreshold) {
    return assignTask(ns, member.name, 'Vigilante Justice');
  }
  else return false;
}

export function assignTerritory(ns: NS, member: GangMemberInfo) {

  if (getMinWinChance(ns) <= minWinChanceThreshold) { return assignTask(ns, member.name, 'Territory Warfare') }
  else {
    return false;
  }
}

export function getMinWinChance(ns: NS) {
  let otherGangs = ns.gang.getOtherGangInformation();
  delete otherGangs[ns.gang.getGangInformation().faction]

  let minWinChance = 1;

  for (let faction in otherGangs) {
    if (otherGangs[faction].territory == 0) { continue; }
    let winChance = ns.gang.getChanceToWinClash(faction)
    if (winChance < minWinChance) {
      minWinChance = winChance;
    }
  }
  return minWinChance;
}
export function ascendMember(ns: NS, member: GangMemberInfo) {

  let ascendedMember = ns.gang.getAscensionResult(member.name);
  if (!ascendedMember) {
    return false;
  }

  if (Math.min(ascendedMember.agi, ascendedMember.def, ascendedMember.dex, ascendedMember.str) >= 1.1) {
    ns.gang.ascendMember(member.name);
    const i = data.Members?.findIndex((memberData) => memberData.Name === member.name) ?? -1;
    if (i !== -1) {
      data.Members[i].StartTrainingSinceAscend = currentTime;
    }
    return true;
  }

  return false;
}

export function buyEquipment(ns: NS, members: string[]) {

  let limits = [0.00001, 0.0001, 0.001, 0.01, 0.1, 1];
  // do the buying in separate traverses, to ensure not too much money is spend on only a single upgrade
  let startingMoney = ns.getServerMoneyAvailable('home');
  for (let limit of limits) {
    let limitToBuy = startingMoney * limit;
    for (let member of members) {
      buyEquipmentForMemberLimited(ns, member, limitToBuy);
    }
  }

}

export function buyEquipmentForMemberLimited(ns: NS, member: string, limit: number) {
  const equipmentNames = ns.gang.getEquipmentNames();
  for (let i = 0; i < equipmentNames.length; i++) {
    if (['Weapon', 'Augmentation', 'Armor', 'Vehicle'].includes(ns.gang.getEquipmentType(equipmentNames[i]))
      && ns.gang.getEquipmentCost(equipmentNames[i]) <= limit
      && (ns.gang.getEquipmentStats(equipmentNames[i]).str
        || ns.gang.getEquipmentStats(equipmentNames[i]).def
        || ns.gang.getEquipmentStats(equipmentNames[i]).dex
        || ns.gang.getEquipmentStats(equipmentNames[i]).agi)) {
      ns.gang.purchaseEquipment(member, equipmentNames[i])
    }
  }
}

/*
* returns TRUE if player is in gang, creates the gang if it is possible
* returns FALSE if the player is not in a gang and cannot create a gang
*/

export function getCreateInGang(ns: NS) {
  if (!ns.gang.inGang()) {
    const faction = ns.enums.FactionName.SlumSnakes;
    if (ns.getPlayer().factions.includes(faction)) {
      return ns.gang.createGang(faction)
    }
    else return false;
  }
  else {
    return true;
  }

}

export function getStrongestMember(ns: NS) {
  let members = ns.gang.getMemberNames().sort((a, b) => (ns.gang.getMemberInformation(a).str - ns.gang.getMemberInformation(b).str));
  return members[members.length - 1];
}

export function assignTask(ns: NS, member: string, task: string) {
  const i = data.Members?.findIndex((memberData) => memberData.Name === member) ?? -1;
  if (i !== -1) {
    if (data.Members[i].PreviousTask !== task) {
      data.Members[i].PreviousTaskStart = currentTime;
      data.Members[i].PreviousTask = task;
    }
    return ns.gang.setMemberTask(member, task);
  }
}

export function recruitMember(ns: NS) {
  let name = crypto.randomUUID() as string;
  for (const nameToUse of names) {
    if (!ns.gang.getMemberNames().includes(nameToUse)) {
      name = nameToUse;
      break;
    }
  }
  return ns.gang.recruitMember(name) ? name : false

}


export function cleanUpData(ns: NS) {
  let members = ns.gang.getMemberNames();

  data.Members = data.Members.filter(member => members.includes(member.Name));
}