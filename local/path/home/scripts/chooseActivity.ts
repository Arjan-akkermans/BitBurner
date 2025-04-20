
let file = 'data/globals.json';
let globals = {} as Globals
import { run } from './autoPlay'
export async function main(ns: NS) {

  globals = JSON.parse(ns.read(file));
  if (globals.activityType === 'FACTION') {
    return
  }
  let limits = {
    strength: 50,
    defence: 50,
    dexterity: 50,
    agility: 50
  }
  // early game mug
  if (ns.singularity.getOwnedAugmentations().length < 30) {
    await trainUntill(ns, limits);
    return
  }

  if (!ns.gang.inGang() && globals.startGang) {
    // current stats will give just under 85% chance success for homicide
    let limits = {
      strength: 80,
      defence: 80,
      dexterity: 70,
      agility: 70
    }

    await trainUntill(ns, limits);
    await run(ns, 'scripts/commitCrime.ts', ['Homicide']);
  }
  else {
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
  }
  await run(ns, 'scripts/workForFaction.ts');

}

export async function trainUntill(ns: NS, limits: { strength: number, defence: number, dexterity: number, agility: number }) {

  let player = ns.getPlayer();

  if (player.skills.strength < limits.strength) {

    await run(ns, 'scripts/trainSkill.ts', ['str'])
    globals.activityType = 'CLASS';
  }
  else if (player.skills.defense < limits.defence) {

    await run(ns, 'scripts/trainSkill.ts', ['def'])
    globals.activityType = 'CLASS';
  }
  else if (player.skills.dexterity < limits.dexterity) {

    await run(ns, 'scripts/trainSkill.ts', ['dex'])
    globals.activityType = 'CLASS';
  }
  else if (player.skills.agility < limits.agility) {

    await run(ns, 'scripts/trainSkill.ts', ['agi'])
    globals.activityType = 'CLASS';
  }
  else {
    await run(ns, 'scripts/commitCrime.ts', ['Mug'])
    globals.activityType = 'CRIME';
  }
  ns.write(file, JSON.stringify(globals), 'w');
}