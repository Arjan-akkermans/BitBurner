import { resetGlobals } from "./autoPlay";

let file = 'data/globals.json';
export async function main(ns: NS) {

  let proceedFromScript = true;

  if (proceedFromScript || ns.args.length > 0 && ns.args[0] as boolean) {
    // update global skip such that after installation servers are upgraded again

    ns.write('data/log.buyAugments.txt', 'installing augments /n', 'a')
    ns.write('data/shareLoop.txt', 'false', 'w');
    ns.tprint('fix me hardcoded donation, also below');
    if (ns.args.length > 1 && ns.singularity.getFactionFavor(ns.args[1] as string) >= ns.getFavorToDonate()) {
      ns.singularity.donateToFaction(ns.args[1] as string, (ns.getServerMoneyAvailable('home')))
    }

    resetGlobals(ns);
    ns.singularity.installAugmentations('scripts/autoPlay.ts')
  }
  else {
    ns.tprint('not installing because false is hardcoded here')
  }

}
