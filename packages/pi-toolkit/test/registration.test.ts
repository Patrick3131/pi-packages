import assert from "node:assert/strict";
import test from "node:test";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import tools from "../src/features/tools/index.js";
import presets from "../src/features/presets/index.js";
import mentions from "../src/features/skill-mentions/index.js";
import overview from "../src/features/overview/index.js";

test("separate feature factories register once in preserved order and any feature can be omitted",()=>{
 const factories=[presets,tools,mentions,overview];
 for(const omit of [-1,0,1,2,3]){
  const commands:string[]=[],events:string[]=[];
  const forbidden=()=>{throw Error("runtime API called at load time")};
  const pi={registerCommand:(name:string)=>{assert.ok(!commands.includes(name));commands.push(name)},on:(name:string)=>events.push(name),registerFlag:()=>{},registerShortcut:()=>{},registerEntryRenderer:()=>{},getAllTools:forbidden,getActiveTools:forbidden,setActiveTools:forbidden,getCommands:forbidden} as unknown as ExtensionAPI;
  factories.forEach((factory,index)=>{if(index!==omit)factory(pi)});
  const expected=["preset","tools","skill-mentions","overview"].filter((_,index)=>index!==omit);assert.deepEqual(commands,expected);
  if(omit===-1)assert.deepEqual(events.filter(e=>e==="session_start"),["session_start","session_start","session_start"]);
 }
});
