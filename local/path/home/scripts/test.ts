import { sortAugments, getXpNeeded, getHGWThreads } from './utils'
import { infectServer, getServerToHack, getAllServers } from './utils'
import { infectServers } from './infectServers'
import { getProduction, getProductionDifference, getNodeCost } from './upgrade-hacknet'
import { buyAugmentsFromGang } from './checkBuyAndInstallAugments'
import { acceptFactionInvitations } from './acceptFactionInvitation';
import { workHackingForFaction } from './workForFaction';

export async function main(ns: NS) {

  ns.tprint(JSON.parse(''))
}

export function rigCasino(ns: NS) {
  Math.floor = (number) => { return 1 }; Math.random = () => { return 0 };
}

/*
 
  while (!ns.getPlayer().factions.includes(ns.enums.FactionName.Daedalus)) {
    ns.singularity.joinFaction(ns.enums.FactionName.Daedalus);
    await ns.sleep(10000);
  }
 
  ns.singularity.workForFaction(ns.enums.FactionName.Daedalus, ns.enums.FactionWorkType.hacking)
}
*/
export function solveValidMathExp(ns: NS, data: any) {
  const num = data[0];
  const target = data[1];
  let answer = '';
  function helper(
    res: string[],
    path: string,
    num: string,
    target: number,
    pos: number,
    evaluated: number,
    multed: number,
  ): void {
    if (pos === num.length) {
      if (target === evaluated) {
        res.push(path);
      }
      return;
    }

    for (let i = pos; i < num.length; ++i) {
      if (i != pos && num[pos] == "0") {
        break;
      }
      const cur = parseInt(num.substring(pos, i + 1));

      if (pos === 0) {
        helper(res, path + cur, num, target, i + 1, cur, cur);
      } else {
        helper(res, path + "+" + cur, num, target, i + 1, evaluated + cur, cur);
        helper(res, path + "-" + cur, num, target, i + 1, evaluated - cur, -cur);
        helper(res, path + "*" + cur, num, target, i + 1, evaluated - multed + multed * cur, multed * cur);
      }
    }
  }

  const result: string[] = [];
  helper(result, "", num, target, 0, 0, 0);
  ns.tprint(result);
  if (result.length !== answer.length) return false;

  return result;
}

