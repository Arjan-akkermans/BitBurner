const file = 'data/manageGang.json';
const names = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
let fileGlobals = 'data/globals.json';
let globals = {} as Globals;
type GangData = {
  Members?: {
    Name: string;
    PreviousTask: string;
    PreviousTaskStart: number;
    StartTrainingSinceAscend: number;
  }[],
  CurrentTick: number,
  clashTickFound: boolean,
  previousPower: number,
  previousTerritory: number
};
// used to switch around tasks as to not get stuck
const switchTaskAfter = 1000 * 60 * 1; // 1 minute
let data = {} as GangData;
let currentTime = new Date().getTime();
let minWinChanceThreshold = 0.95 // when to assign to warfare
let minWinChangeStartWarfare = 0.6
const ticksForWarfare = 10; //TODO this is normally 10 ( 10 cycles per update, 100 cycles for warfare), but can change with bonus time
export async function main(ns: NS) {
  currentTime = new Date().getTime();
  globals = JSON.parse(ns.read(fileGlobals))
  data = JSON.parse((ns.read(file) === '') ? '{}' : ns.read(file)) as GangData;
  initData(ns);
  // call above created members, this is just for type inference
  if (data.Members === undefined) {
    return;
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

  let gangInformation = ns.gang.getGangInformation();
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
      if (data.CurrentTick === 1 && data.clashTickFound) {
        let taskToAssign = data.Members[i].PreviousTask;
        if (taskToAssign === 'Unassigned') {
          getMoney(ns, memberInformation, 0);
        }
        else {
          ns.gang.setMemberTask(member, data.Members[i].PreviousTask);
        }
      }
      if (data.Members[i].PreviousTask === 'Train Combat'
        && (currentTime - data.Members[i].StartTrainingSinceAscend) < switchTaskAfter
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
      // after reset immidiately make some money to speed up initial grinding
      if (new Date().getTime() - ns.getResetInfo().lastAugReset < switchTaskAfter) {
        getMoney(ns, memberInformation, 0);
        continue
      }
      let minRep = respectTillNextMember / 100000
      // drop wanted first as it decreases all other activities
      if (!dropWanted(ns, memberInformation)) {
        // get respect if it is 'soon' to a new member can be recruited
        if (!getRespect(ns, memberInformation, minRep)) {
          // otherwise get money (if specific value can be gotten???)

          let timeSinceLastTask = (currentTime - data.Members[i].PreviousTaskStart);
          if (data.Members[i].PreviousTask === 'Train Combat') {
            if (timeSinceLastTask > switchTaskAfter) {
              // there is no need to get anymore respect if discount is already a high factor
              // logic above already assigns respect if thats needed to drop wanted penalty
              if (getDiscount(ns) < 10000 && Math.random() >= 0.5) {
                getRespect(ns, memberInformation, 0);
              }
              else {
                getMoney(ns, memberInformation, 0)
              }

            }
          }
          else {
            if (timeSinceLastTask > switchTaskAfter || ns.gang.getMemberInformation(member).task === 'Unassigned') {
              trainMember(ns, memberInformation);
            }
          }
          /*  // threshold based on previous task start, such that we eventually switch
            if (!getMoney(ns, memberInformation, thresholdMoneyGain)) { // getMoneyOrRespect??? this should at least be switched occasionally?
              if (!getRespect(ns, memberInformation, thresholdMoneyGain / 10)) {
                trainMember(ns, memberInformation);
              }
            }*/
        }
      }
    }
  }
  buyEquipment(ns, members);
  // if at the warfare tick, assign all members, next tick will unassign again
  assignWarfareOnTick(ns, members);

  ns.gang.setTerritoryWarfare(getMinWinChance(ns) >= minWinChangeStartWarfare)
  updateCycleInformation(ns);
  ns.write(file, JSON.stringify(data), 'w');

  await waitAndRestart(ns);
}

export function initData(ns: NS) {
  if (data.Members === undefined) {
    data.Members = [];
  }
  if (data.CurrentTick === undefined) {
    data.CurrentTick = 0;
  }
  if (data.clashTickFound === undefined) {
    data.clashTickFound = false;
  }
}

export function updateCycleInformation(ns: NS) {

  let gangInformation = ns.gang.getGangInformation();
  let power = gangInformation.power;
  let territory = gangInformation.territory;

  if ((data.previousPower !== undefined && data.previousPower !== power
    || data.previousTerritory !== undefined && data.previousTerritory !== territory
  ) && ns.gang.getBonusTime() === 0) {
    data.clashTickFound = true;
    data.CurrentTick = 0;
  }
  data.previousPower = power;
  data.previousTerritory = territory;
  data.CurrentTick++;
  if (data.CurrentTick > ticksForWarfare) {
    data.CurrentTick = 1;
  }
}

export async function waitAndRestart(ns: NS) {
  updateHUD(ns);
  if (ns.gang.inGang()) {
    await ns.gang.nextUpdate();
  }
  else {
    await ns.sleep(10000);
  }
  ns.spawn('scripts/manageGang.ts', { spawnDelay: 0 })
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
  // wanted penalty is a multiplier, i.e. 1 means no penalty
  if (gangInformation.wantedLevel < 100 && gangInformation.wantedPenalty < 0.90) {
    getRespect(ns, member, 1);
  }

  let wantedThreshold = 9 * gangInformation.respect // penalty =  this.respect / (this.respect + this.wanted);
  // threshold such that penalty is at most 10%
  if (ns.gang.getGangInformation().wantedLevel > wantedThreshold) {
    return assignTask(ns, member.name, 'Vigilante Justice');
  }
  else return false;
}

export function assignWarfareOnTick(ns: NS, members: string[]) {
  // tick is only updated at the end
  if (data.CurrentTick !== ticksForWarfare - 1) {
    return;
  }
  for (let member of members) {
    assignTerritory(ns, ns.gang.getMemberInformation(member));
  }
}

export function assignTerritory(ns: NS, member: GangMemberInfo) {

  // call directly the ns.gang method so that other stats, i.e. previous task etc are not updated
  // TODO improve? currently thats a bit hacky
  if (getMinWinChance(ns) < minWinChanceThreshold) { return ns.gang.setMemberTask(member.name, 'Territory Warfare') }
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

  if (Math.min(ascendedMember.agi, ascendedMember.def, ascendedMember.dex, ascendedMember.str) >= 1.15) {
    ns.gang.ascendMember(member.name);
    if (!data.Members) {
      return
    }
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
    if ((['Weapon', 'Augmentation', 'Armor', 'Vehicle'].includes(ns.gang.getEquipmentType(equipmentNames[i]))
      && ns.gang.getEquipmentCost(equipmentNames[i]) <= limit
      && (ns.gang.getEquipmentStats(equipmentNames[i]).str
        || ns.gang.getEquipmentStats(equipmentNames[i]).def
        || ns.gang.getEquipmentStats(equipmentNames[i]).dex
        || ns.gang.getEquipmentStats(equipmentNames[i]).agi))
      // extra condtion to buy other aguments if 'really cheap', hacking still has some benefit for combat gangs
      || ns.gang.getEquipmentCost(equipmentNames[i]) < 0.0001 * limit) {
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

// returns the discount for equipment, the cost of equipment is divided by this value
export function getDiscount(ns: NS) {
  // from source code Gang.ts
  let gangInformation = ns.gang.getGangInformation();
  let respect = gangInformation.respect;
  let power = gangInformation.power;
  const respectLinearFac = 5e6;
  const powerLinearFac = 1e6;
  const discount =
    Math.pow(respect, 0.01) + respect / respectLinearFac + Math.pow(power, 0.01) + power / powerLinearFac - 1;
  return Math.max(1, discount);
}

export function getStrongestMember(ns: NS) {
  let members = ns.gang.getMemberNames().sort((a, b) => (ns.gang.getMemberInformation(a).str - ns.gang.getMemberInformation(b).str));
  return members[members.length - 1];
}

export function assignTask(ns: NS, member: string, task: string) {
  if (!data.Members) {
    return
  }

  const i = data.Members.findIndex((memberData) => memberData.Name === member) ?? -1;
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

export function resetGangData(ns: NS) {
  let fileToWrite = 'data/manageGang.json';;
  ns.write(fileToWrite, JSON.stringify({}), 'w');
}


export function cleanUpData(ns: NS) {
  let members = ns.gang.getMemberNames();


  //data.Members = data.Members.filter(member => members.includes(member.Name));
}

export function updateHUD(ns: NS) {
  globals = JSON.parse(ns.read(fileGlobals))
  if (!!globals.HUDPort) {
    let dataToWrite = { sequence: 1, rows: [] as HUDRow[] }

    dataToWrite.rows.push({ header: 'Tick', value: `${data.CurrentTick}` });
    dataToWrite.rows.push({ header: 'FoundClash', value: `${data.clashTickFound}` });

    ns.writePort(globals.HUDPort, dataToWrite)
  }
}
