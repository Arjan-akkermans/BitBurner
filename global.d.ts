import
  * as Netscript
  from 'NetscriptDefinitions';

declare global {
  type NS = Netscript.NS
  type ScriptArg = Netscript.ScriptArg
  type Server = Netscript.Server;
  type Person = Netscript.Person;
  type GangMemberInfo = Netscript.GangMemberInfo;
  type CrimeType = Netscript.CrimeType;
  type TaskType = Netscript.Task["type"] | undefined;
  type GymType = Netscript.GymType;
  type NodeStats = Netscript.NodeStats;
  type SpawnOptions = Netscript.SpawnOptions;
  type GoOpponent = Netscript.GoOpponent;
  type HUDRow = { header: string, value: string }
  type PortHUDData = {
    sequence: number, rows: HUDRow[]
  }

  type Globals = { activityType?: TaskType, factionToWorkFor: string, skip: boolean, trainHack: boolean, reset: boolean; startGang: boolean; lastBatchMoneyGain: number, HUDPort?: number }
}