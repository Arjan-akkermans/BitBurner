export async function main(ns: NS) {
  purchasePrograms(ns);
}

export const purchasePrograms = (ns: NS) => {
  if (ns.singularity.purchaseTor()) {
    ns.singularity.getDarkwebPrograms().forEach((
      program
    ) => {
      if (!ns.fileExists(program, 'home') && ns.singularity.getDarkwebProgramCost(program) <= ns.getServerMoneyAvailable('home')) {
        ns.tprint('buying program ', program);
        ns.singularity.purchaseProgram(program);
      }
    })
  }
  else {
    ns.tprint('not enough money for TOR ');
  }
}