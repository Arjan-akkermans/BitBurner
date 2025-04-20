export async function main(ns: NS) {
  acceptFactionInvitations(ns);
}

export function acceptFactionInvitations(ns: NS) {
  const invitations = ns.singularity.checkFactionInvitations();
  for (let i = 0; i < invitations.length; i++) {
    ns.singularity.joinFaction(invitations[i]);
  }
}