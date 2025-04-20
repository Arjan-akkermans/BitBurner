import { getServerConnectString } from './utils'

export async function main(ns: NS) {

  getServerConnectString(ns, ns.args[0] as string)
}