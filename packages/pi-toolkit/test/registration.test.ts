import assert from "node:assert/strict";
import test from "node:test";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import tools from "../src/features/tools/index.js";
import presets from "../src/features/presets/index.js";
import mentions from "../src/features/skill-mentions/index.js";
import actions from "../src/features/inline-actions/index.js";
import overview from "../src/features/overview/index.js";

/** Feature entry points in package order; not every feature owns a command. */
const FEATURES: {command?: string; sessionStart: boolean; factory: (pi: ExtensionAPI) => void}[] = [
 {command: "preset", sessionStart: true, factory: presets},
 {command: "tools", sessionStart: true, factory: tools},
 {command: "skill-mentions", sessionStart: true, factory: mentions},
 {sessionStart: true, factory: actions},
 {command: "overview", sessionStart: false, factory: overview},
];

test("separate feature factories register once in preserved order and any feature can be omitted",()=>{
 for(let omit=-1;omit<FEATURES.length;omit++){
  const loaded=FEATURES.filter((_,index)=>index!==omit);
  const commands:string[]=[],events:string[]=[];
  const forbidden=()=>{throw Error("runtime API called at load time")};
  const pi={registerCommand:(name:string)=>{assert.ok(!commands.includes(name));commands.push(name)},on:(name:string)=>events.push(name),registerFlag:()=>{},registerShortcut:()=>{},registerEntryRenderer:()=>{},getAllTools:forbidden,getActiveTools:forbidden,setActiveTools:forbidden,setModel:forbidden,setThinkingLevel:forbidden,getCommands:forbidden} as unknown as ExtensionAPI;
  for(const feature of loaded)feature.factory(pi);
  assert.deepEqual(commands,loaded.map(feature=>feature.command).filter((name):name is string=>name!==undefined));
  assert.equal(events.filter(event=>event==="session_start").length,loaded.filter(feature=>feature.sessionStart).length);
 }
});
