import { resetGlobals } from "./autoPlay";
import { resetStocks } from "./stock"

let file = 'data/globals.json';
export async function main(ns: NS) {

  let proceedFromScript = true;

  if (proceedFromScript || ns.args.length > 0 && ns.args[0] as boolean) {
    // update global skip such that after installation servers are upgraded again

    ns.write('data/log.buyAugments.txt', 'installing augments /n', 'a')
    ns.write('data/shareLoop.txt', 'false', 'w');

    resetGlobals(ns);
    try {
      ns.singularity.installAugmentations('scripts/autoPlay.ts')
    }
    finally {
      ns.singularity.softReset('scripts/autoPlay.ts')
    }
  }
  else {
    ns.tprint('not installing because false is hardcoded here')
  }

}
