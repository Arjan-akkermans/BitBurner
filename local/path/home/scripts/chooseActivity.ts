
let file = 'data/globals.json';
let globals = {} as Globals
import { run } from './autoPlay'
export async function main(ns: NS) {

  globals = JSON.parse(ns.read(file));

  /*let isTraining = await trainTillTime(ns);
 
  if (isTraining) {
    return;
  }*/
  if (globals.activityType === 'FACTION' && globals.lastBatchMoneyGain > 0 && (ns.gang.inGang() || !globals.startGang)) {
    await run(ns, 'scripts/workForFaction.ts');
    return
  }
  let limits = {
    strength: 20,
    defence: 20,
    dexterity: 20,
    agility: 20
  }
  // early game mug
  if (globals.lastBatchMoneyGain < 10000000) {
    let isTrained = await trainUntill(ns, limits);
    if (isTrained) {
      await doBestCrime(ns);
    }
    return
  }


  if (!ns.gang.inGang() && globals.startGang) {
    let limits = {
      strength: 60,
      defence: 60,
      dexterity: 60,
      agility: 60
    }
    let isTrained = await trainUntill(ns, limits);
    if (!isTrained) {
      return;
    }

    await run(ns, 'scripts/commitCrime.ts', ['Homicide']);
    return
  }
  else {
    if (globals.trainForCombatFactions) {

      limits = {
        strength: 850,
        defence: 850,
        dexterity: 850,
        agility: 850
      }

      // limits above are for covenant, if augment is already available, switch to illuminatie
      if (ns.singularity.getOwnedAugmentations().some((ownedAugment) => ownedAugment === 'SPTN-97 Gene Modification')) {
        limits.strength = 1200;
        limits.defence = 1200;
        limits.dexterity = 1200;
        limits.agility = 1200;
      }
      await trainUntill(ns, limits);
      return;
    }
    else {
      globals.activityType = 'FACTION';
      ns.write(file, JSON.stringify(globals), 'w');
    }

  }
  await run(ns, 'scripts/workForFaction.ts');

}

export async function trainTillTime(ns: NS) {
  if (globals.trainingTime === undefined) {
    globals.trainingTime = { lastTrainingStart: 0, lastTrainingActivity: 'str', str: 0, def: 0, dex: 0, agi: 0 }
  }
  // train if stats are not yet all trained for 1 min
  const trainingTimeDuration = globals.trainingTime.lastTrainingStart === 0 ? 0 : new Date().getTime() - globals.trainingTime.lastTrainingStart;
  let trainingTime = globals.trainingTime;
  // increase training counter
  if (trainingTime.lastTrainingActivity === 'str') {
    trainingTime.str += trainingTimeDuration
  }
  if (trainingTime.lastTrainingActivity === 'def') {
    trainingTime.def += trainingTimeDuration
  }
  if (trainingTime.lastTrainingActivity === 'dex') {
    trainingTime.dex += trainingTimeDuration
  }
  if (trainingTime.lastTrainingActivity === 'agi') {
    trainingTime.agi += trainingTimeDuration
  }

  // then train the first value which is not yet trained for 1 minute
  let doTrain = false;
  if (globals.trainingTime.str < 60 * 1000) {

    await run(ns, 'scripts/trainSkill.ts', ['str'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (globals.trainingTime.def < 60 * 1000) {

    await run(ns, 'scripts/trainSkill.ts', ['def'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (globals.trainingTime.def < 60 * 1000) {

    await run(ns, 'scripts/trainSkill.ts', ['dex'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (globals.trainingTime.agi < 60 * 1000) {

    await run(ns, 'scripts/trainSkill.ts', ['agi'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  ns.write(file, JSON.stringify(globals), 'w');
  return doTrain;
}


/**
 *
 * trains untill the limits, return TRUE if player has reached the limits
 */
export async function trainUntill(ns: NS, limits: { strength: number, defence: number, dexterity: number, agility: number }) {

  let player = ns.getPlayer();
  let doTrain = false;
  if (player.skills.strength < limits.strength) {

    await run(ns, 'scripts/trainSkill.ts', ['str'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (player.skills.defense < limits.defence) {

    await run(ns, 'scripts/trainSkill.ts', ['def'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (player.skills.dexterity < limits.dexterity) {

    await run(ns, 'scripts/trainSkill.ts', ['dex'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  else if (player.skills.agility < limits.agility) {

    await run(ns, 'scripts/trainSkill.ts', ['agi'])
    globals.activityType = 'CLASS';
    doTrain = true;
  }
  ns.write(file, JSON.stringify(globals), 'w');
  return !doTrain;

}

export async function doBestCrime(ns: NS) {
  let player = ns.getPlayer();
  const crimes = [ns.enums.CrimeType.assassination, ns.enums.CrimeType.bondForgery, ns.enums.CrimeType.dealDrugs, ns.enums.CrimeType.grandTheftAuto, ns.enums.CrimeType.heist, ns.enums.CrimeType.homicide, ns.enums.CrimeType.kidnap, ns.enums.CrimeType.larceny, ns.enums.CrimeType.mug, ns.enums.CrimeType.robStore, ns.enums.CrimeType.shoplift, ns.enums.CrimeType.traffickArms]
  let bestCrime = crimes[0];
  for (let i = 1; i < crimes.length; i++) {
    if (ns.formulas.work.crimeSuccessChance(player, crimes[i]) >= 0.5 && getCrimeMoneyPerTime(ns, player, crimes[i]) > getCrimeMoneyPerTime(ns, player, bestCrime)) {
      bestCrime = crimes[i];
    }
  }
  await run(ns, 'scripts/commitCrime.ts', [bestCrime])
  globals.activityType = 'CRIME';
  ns.write(file, JSON.stringify(globals), 'w');

}

export function getCrimeMoneyPerTime(ns: NS, player: Person, crime: CrimeType) {
  let value = ns.formulas.work.crimeGains(player, crime).money * ns.formulas.work.crimeSuccessChance(player, crime) / ns.singularity.getCrimeStats(crime).time;
  return value;
}