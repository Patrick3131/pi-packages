import { mkdirSync, openSync, writeFileSync, closeSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { collectOverview } from "./collect.js";
import { renderOverview } from "./html.js";
import { object, string } from "./normalize.js";
import type { Capability, ProviderObservation, RuntimeSnapshot } from "./types.js";

interface InspectApi {
 getAllTools?: () => unknown; getActiveTools?: () => string[]; getCommands?: () => unknown;
 getThinkingLevel?: () => string; getSettings?: () => unknown; getMcpServers?: () => unknown;
 exec?: (command:string,args:string[]) => Promise<{code?:number; stdout?:string; stderr?:string} | void>;
}
interface InspectContext {
 cwd:string; mode?:string; isProjectTrusted?:()=>boolean; model?: {provider:string;id:string};
 sessionManager:{getSessionId:()=>string;getBranch?:()=>unknown[]};
 getSystemPromptOptions?:()=>unknown;
 modelRegistry?:{getAll?:()=>{provider:string;id:string}[];getProviderAuthStatus?:(id:string)=>unknown};
 ui:{notify:(message:string,level?:"info"|"warning"|"error")=>void};
}
function read<T>(fn: (()=>T)|undefined):T|undefined {try{return fn?.();}catch{return undefined;}}
function array<T>(value:unknown):T[]|undefined{return Array.isArray(value)?value as T[]:undefined;}
export async function handleOverview(pi:InspectApi,ctx:InspectContext,args:string,options:{agentDir?:string;outputDir?:string}={}):Promise<string|undefined>{
 if(args.trim()){ctx.ui.notify("/overview takes no arguments. Run /overview to open My Pi.","error");return undefined;}
 const agentDir=options.agentDir??getAgentDir();
 const prompt=object(read(()=>ctx.getSystemPromptOptions?.()));
 const models=read(()=>ctx.modelRegistry?.getAll?.());
 const providerIds=new Set((models??[]).map(m=>m.provider));
 if(ctx.model)providerIds.add(ctx.model.provider);
 const providers:ProviderObservation[]|undefined=ctx.modelRegistry?.getProviderAuthStatus?[...providerIds].map(id=>{
  const auth=object(read(()=>ctx.modelRegistry?.getProviderAuthStatus?.(id)));
  const configured=typeof auth.configured==="boolean"?auth.configured:undefined;
  const count=(models??[]).filter(m=>m.provider===id).length;
  return {id,configured,authSource:string(auth.source),count,available:configured===undefined?undefined:configured?count:0};
 }):undefined;
 const runtime:RuntimeSnapshot={
  tools:array<Capability>(read(()=>pi.getAllTools?.())),activeTools:read(()=>pi.getActiveTools?.()),
  commands:array<Capability>(read(()=>pi.getCommands?.())),model:ctx.model,thinking:read(()=>pi.getThinkingLevel?.()),
  presets:read(()=>ctx.sessionManager.getBranch?.()),settings:read(()=>pi.getSettings?.()),
  mcpRegistrations:array(read(()=>pi.getMcpServers?.())),
  skills:array(prompt.skills),hiddenTools:array(prompt.hiddenTools),providers
 };
 const snapshot=collectOverview({agentDir,cwd:ctx.cwd,trusted:read(()=>ctx.isProjectTrusted?.())===true,runtime});
 const configured=options.outputDir??process.env.PI_OVERVIEW_DIR;
 const dir=configured?resolve(configured.startsWith("~/")?homedir()+configured.slice(1):configured):join(agentDir,"overview");
 const id=ctx.sessionManager.getSessionId().replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,80)||"session";
 const file=join(dir,"overview-"+id+".html"),temp=join(dir,".overview-"+randomUUID()+".tmp");
 try{
  mkdirSync(dir,{recursive:true,mode:0o700});
  const fd=openSync(temp,"wx",0o600);
  try{writeFileSync(fd,renderOverview(snapshot),"utf8");}finally{closeSync(fd);}
  renameSync(temp,file);
 }catch{
  try{unlinkSync(temp);}catch{/* no partial temp */}
  ctx.ui.notify("Overview: unable to write HTML report to "+file,"error");return undefined;
 }
 ctx.ui.notify("My Pi: "+file,"info");
 if(ctx.mode==="tui"&&pi.exec)try{
  const result=await pi.exec(process.platform==="darwin"?"open":process.platform==="win32"?"explorer.exe":"xdg-open",[file]);
  if(result&&result.code!==undefined&&result.code!==0)throw Error();
 }catch{ctx.ui.notify("Browser could not be opened. My Pi is saved at "+file,"warning");}
 return file;
}
export default function overviewExtension(pi:ExtensionAPI){
 pi.registerCommand("overview",{description:"Open My Pi: a read-only HTML overview of this setup",handler:async(args,ctx)=>{
  await handleOverview(pi as unknown as InspectApi,ctx as unknown as InspectContext,args);
 }});
}
