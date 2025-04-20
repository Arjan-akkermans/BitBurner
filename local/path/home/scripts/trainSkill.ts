
let file = 'data/globals.json';

export async function main(ns: NS) {
  const skillToTrain = ns.args[0] as GymType | 'cha';
  const player = ns.getPlayer();
  if (['str', 'def', 'dex', 'agi'].includes(skillToTrain)) {
    if (ns.getPlayer().city !== ns.enums.CityName.Sector12) {
      if (player.money > 200000) {
        ns.singularity.travelToCity(ns.enums.CityName.Sector12);
      }
      else {
        ns.tprint('skip training because there is no money to travel');
        return;
      }
    }
    ns.singularity.gymWorkout(ns.enums.LocationName.Sector12PowerhouseGym, skillToTrain as GymType);
  }
  else if (skillToTrain === 'cha') {
    if (ns.getPlayer().city !== ns.enums.CityName.Volhaven) {
      if (player.money > 200000) {
        ns.singularity.travelToCity(ns.enums.CityName.Volhaven);
      }
      else {
        ns.tprint('skip training because there is no money to travel');
        return;
      }
    }
    ns.singularity.universityCourse(ns.enums.LocationName.VolhavenZBInstituteOfTechnology, 'Leadership');
  }
}

