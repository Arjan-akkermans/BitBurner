import { infectServer } from './utils'
export async function main(ns: NS) {

  infectServer(ns, ns.getServer('n00dles'));
  ns.writePort(1, 'hacked n00dles')

}