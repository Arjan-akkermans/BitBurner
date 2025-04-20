let file = 'data/globals.json';

export async function main(ns: NS) {
  const task = ns.singularity.getCurrentWork();
  let crimeToCommit = ns.args[0] as CrimeType;
  if (task.type !== "CRIME" || task.crimeType !== crimeToCommit) {
    ns.singularity.commitCrime(crimeToCommit);
  }
}