import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { activePresetName, sameToolSet } from "../tools/state.js";
import { parsePresetsJson } from "../presets/config.js";
import { parseProjectToolsJson } from "../tools/project-config.js";
import { anchor, localPath, object, packageIdentity, safeSource, string, strings } from "./normalize.js";
import type { CollectOptions, Item, Overview, Source } from "./types.js";

function item(kind: string, list: Item[], name: string, source: string, scope?: string): Item {
 const entry: Item={id:anchor(kind,list.length),name,source:safeSource(source),scope,status:[],facts:{},links:[]};list.push(entry);return entry;
}
export function collectOverview(o: CollectOptions): Overview {
 const r=o.runtime, warnings:string[]=[];
 function json(path:string, required=false): Record<string,unknown> {
  if(!existsSync(path)){if(required)warnings.push(path+": missing");return {};}
  try {const value:unknown=JSON.parse(readFileSync(path,"utf8"));if(value===null||typeof value!=="object"||Array.isArray(value))throw Error();return object(value);}
  catch {warnings.push(path+": unreadable or invalid JSON");return {};}
 }
 const globalPath=join(o.agentDir,"settings.json"),projectPath=join(o.cwd,".pi/settings.json");
 const global=json(globalPath,true), project=o.trusted?json(projectPath):{};
 if(!o.trusted)warnings.push("project scope withheld: project is not trusted");
 const effective=object(r.settings), startup={...global,...project,...effective};
 const s:Overview={version:1,generatedAt:o.generatedAt??new Date().toISOString(),header:{cwd:o.cwd,agentDir:o.agentDir,trusted:o.trusted,model:r.model?r.model.provider+"/"+r.model.id:"unknown",defaultModel:string(startup.defaultProvider)&&string(startup.defaultModel)?startup.defaultProvider+"/"+startup.defaultModel:"automatic / unknown",thinking:r.thinking??"unknown",preset:activePresetName({entries:r.presets as never})??"none recorded",theme:string(startup.theme)??"system"},packages:[],extensions:[],commands:[],skills:[],tools:[],presets:[],mcp:[],providers:[],relationships:[],warnings};
 function edge(from:Item,to:Item,label:string){if(!s.relationships.some(e=>e.from===from.id&&e.to===to.id&&e.label===label)){s.relationships.push({from:from.id,to:to.id,label});from.links.push(to.id);}}
 const owners=new Map<string,Item>();
 const identities=new Map<string,Item>();
 function installation(source:string,scope:string):string|undefined{
  const base=scope==="user"?o.agentDir:join(o.cwd,".pi");
  if(source.startsWith("npm:")){
   const name=source.slice(4).replace(/(?<!^)@[^/]*$/,"");
   if(!/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/.test(name))return undefined;
   const path=join(base,"npm/node_modules",name);return existsSync(path)?path:undefined;
  }
  if(source.startsWith("git:")||/^https?:/.test(source)){
   const identity=packageIdentity(source,base).slice(4);
   if(!/^[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(identity))return undefined;
   const path=join(base,"git",identity);return existsSync(path)?path:undefined;
  }
  const path=localPath(source,base);return existsSync(path)?path:undefined;
 }
 for(const [config,path,scope] of [[global,globalPath,"user"],[project,projectPath,"project"]] as const){
  const declarations=config.packages;
  if(declarations!==undefined&&!Array.isArray(declarations)){warnings.push(path+": packages must be an array");continue;}
  for(const raw of (Array.isArray(declarations)?declarations:[])){
   const declaration=object(raw),source=string(raw)??string(declaration.source);
   if(!source){warnings.push(path+": invalid package declaration");continue;}
   const base=dirname(path),identity=packageIdentity(source,base);
   const p=item("package",s.packages,safeSource(source),path,scope);p.status.push("declared");p.facts.Identity=identity;
   const old=identities.get(identity);
   if(old&&scope==="project"){if(declaration.autoload===false){p.status.push("filter delta");edge(p,old,"filters personal package");}else{old.status.push("overridden");edge(p,old,"replaces personal declaration");}}
   identities.set(identity,p);
   for(const type of ["extensions","skills","prompts","themes"]){
    if(declaration[type]!==undefined){p.facts[type+" filter"]=strings(declaration[type]);p.status.push("filtered");}
   }
   const installed=installation(source,scope);
   p.facts["Installation path"]=installed??"unknown / not found in managed cache";
   if(!installed) {p.status.push("installation unconfirmed");continue;}
   p.status.push("installed-path-found");
   if(identity.startsWith("local:"))p.facts.Installation="local checkout (loaded in place)";
   let directory=installed;
   try{
    if(statSync(installed).isFile()){
     const ext=item("extension",s.extensions,installed,path,scope);ext.status.push("declared","load unconfirmed");owners.set(installed,ext);edge(p,ext,"declares extension");continue;
    }
   }catch{warnings.push(path+": installation path unreadable");continue;}
   const manifestPath=join(directory,"package.json"),manifest=json(manifestPath);
   if(string(manifest.version))p.facts.Version=manifest.version as string;
   if(string(manifest.name))p.facts["Manifest name"]=manifest.name as string;
   const pi=object(manifest.pi);
   let entries=strings(pi.extensions);
   if(!entries.length&&pi.extensions===undefined){
    const conventional=join(directory,"extensions");
    if(existsSync(conventional))try{entries=readdirSync(conventional).filter(n=>/\.[cm]?[jt]s$/.test(n)).map(n=>"extensions/"+n);}catch{warnings.push(conventional+": unreadable");}
   }
   for(const entry of entries){
    const ext=item("extension",s.extensions,entry,manifestPath,scope);
    ext.status.push("declared","load unconfirmed");ext.facts["Resolved path"]=resolve(directory,entry);
    if(p.status.includes("overridden"))ext.status.push("overridden declaration");
    if(Array.isArray(declaration.extensions)&&declaration.extensions.length===0)ext.status.push("filtered out");
    if(/[*!?\[\]{}]/.test(entry))ext.facts.Discovery="manifest pattern; individual load state unconfirmed";
    else owners.set(resolve(directory,entry),ext);
    edge(p,ext,"manifest declares extension");
   }
   for(const type of ["skills","prompts","themes"]){if(Array.isArray(pi[type]))p.facts["Manifest "+type]=strings(pi[type]);}
  }
  for(const entry of strings(config.skills)){
   const resolved=localPath(entry,dirname(path));
   const skill=item("skill",s.skills,entry,resolved,scope);skill.status.push("declared","load unconfirmed");skill.facts["Configuration file"]=path;
  }
  for(const entry of strings(config.prompts)){
   const prompt=item("command",s.commands,entry,path,scope);prompt.status.push("declared","load unconfirmed");prompt.facts.Kind="configured prompt path";prompt.facts["Resolved path"]=localPath(entry,dirname(path));
  }
  const conventional=join(dirname(path),"extensions");
  const discovered:string[]=[];
  if(existsSync(conventional))try{
   for(const name of readdirSync(conventional)){
    if(/\.[cm]?[jt]s$/.test(name))discovered.push(join(conventional,name));
    else for(const entry of ["index.ts","index.js"]){const file=join(conventional,name,entry);if(existsSync(file))discovered.push(file);}
   }
  }catch{warnings.push(conventional+": unreadable extension discovery root");}
  for(const entry of [...strings(config.extensions),...discovered]){
   const ext=item("extension",s.extensions,entry,path,scope);ext.status.push("declared","load unconfirmed");
   const resolved=entry.startsWith("builtin:")||/^[+-]builtin:/.test(entry)?entry:localPath(entry,dirname(path));
   ext.facts["Resolved path"]=resolved;owners.set(resolved,ext);
  }
 }
 function sourceFor(info:Source|undefined):string{return safeSource(info?.path??info?.source??"runtime source unavailable");}
 function observedOwner(info:Source|undefined):Item|undefined{
  if(!info?.path)return undefined;
  if(/^builtin:(read|write|edit|bash|powershell|grep|find|ls)$/.test(info.path))return undefined;
  let owner=owners.get(info.path);
  if(!owner){
   owner=item("extension",s.extensions,info.path,sourceFor(info),info.scope);owner.status.push("runtime-observed");owners.set(info.path,owner);
   const p=s.packages.find(p=>p.facts["Installation path"]===info.baseDir&&!p.status.includes("overridden"));
   if(p)edge(p,owner,"supplies extension");
  }else if(!owner.status.includes("runtime-observed"))owner.status.push("runtime-observed");
  owner.status=owner.status.filter(v=>v!=="load unconfirmed");
  return owner;
 }
 const active=new Set(r.activeTools??[]),hidden=new Set(r.hiddenTools??[]);
 if(!r.tools)warnings.push("tool registry unavailable: active/callable state unknown");
 if(!r.commands)warnings.push("command registry unavailable");
 if(!r.activeTools)warnings.push("active tool set unavailable");
 if(!r.hiddenTools)warnings.push("loadout hiding metadata unavailable: active set is not proof of direct declaration");
 let preferences:Record<string,boolean>|undefined;
 const toolPath=join(o.cwd,".pi/tools.json");
 if(o.trusted&&existsSync(toolPath))try{preferences=parseProjectToolsJson(readFileSync(toolPath,"utf8"),toolPath);}catch{warnings.push(toolPath+": unreadable or invalid tool preferences");}
 for(const tool of r.tools??[]){
  const t=item("tool",s.tools,tool.name,sourceFor(tool.sourceInfo),tool.sourceInfo?.scope);t.description=tool.description;t.status.push("registered",!r.activeTools?"active state unknown":active.has(tool.name)?"active-set":"inactive");
  t.facts.Exposure=tool.exposure??"unknown";
  t.facts.Reachability=tool.exposure===undefined?"unknown exposure":tool.exposure==="hidden"?"unreachable":tool.exposure==="deferred"||tool.exposure==="codemode"?"indirectly callable even when inactive":tool.exposure==="model-only"?"model-only while active":"callable while active (subject to permissions)";
  t.facts["Direct declaration"]=!r.activeTools||!r.hiddenTools||!tool.exposure?"unknown":active.has(tool.name)&&!hidden.has(tool.name)&&tool.exposure!=="hidden"?"in active set, not loadout-hidden":"not directly declared";
  t.facts["Saved project preference"]=preferences?.[tool.name]===true?"on":preferences?.[tool.name]===false?"off":o.trusted?"not saved":"withheld";
  if(tool.namespace?.name)t.facts.Namespace=tool.namespace.name;
  const owner=observedOwner(tool.sourceInfo);if(owner)edge(owner,t,"registers tool");
 }
 for(const command of r.commands??[]){
  const c=item("command",s.commands,"/"+command.name,sourceFor(command.sourceInfo),command.sourceInfo?.scope);c.description=command.description;c.status.push("runtime-observed");c.facts.Kind=command.source??"unknown";
  if(command.source==="extension"){const owner=observedOwner(command.sourceInfo);if(owner)edge(owner,c,"registers command");}
  if(command.source==="skill"){
   const skill=s.skills.find(k=>k.source===command.sourceInfo?.path)??item("skill",s.skills,command.name.replace(/^skill:/,""),sourceFor(command.sourceInfo),command.sourceInfo?.scope);
   skill.description=command.description;skill.status=skill.status.filter(v=>v!=="load unconfirmed");skill.status.push("runtime-observed skill command");edge(skill,c,"exposes skill command");
  }
 }
 for(const skill of r.skills??[]){
  const existing=s.skills.find(k=>k.source===skill.filePath);
  const k=existing??item("skill",s.skills,skill.name,skill.filePath??"runtime");k.description=skill.description;k.status.push("runtime-observed");
 }
 if(!r.skills)warnings.push("loaded skill metadata unavailable (skill commands may still be listed)");
 const effectivePresets=new Map<string,Item>();
 for(const [path,scope] of [[join(o.agentDir,"presets.json"),"user"],[join(o.cwd,".pi/presets.json"),"project"]] as const){
  if(scope==="project"&&!o.trusted||!existsSync(path))continue;
  let presets;try{presets=parsePresetsJson(readFileSync(path,"utf8"),path);}catch{warnings.push(path+": unreadable or invalid presets");continue;}
  for(const [name,definition] of Object.entries(presets)){
   const p=item("preset",s.presets,name,path,scope);p.status.push("defined on disk");
   const old=effectivePresets.get(name);if(old){old.status.push("overridden");edge(p,old,"replaces whole personal preset");}effectivePresets.set(name,p);
   p.facts.Model=definition.provider&&definition.model?definition.provider+"/"+definition.model:"unchanged";
   p.facts.Thinking=definition.thinkingLevel??"unchanged";
   p.facts["Requested tools"]=definition.tools??["unchanged"];
   p.facts["Unregistered tools"]=r.tools?(definition.tools??[]).filter(n=>!r.tools!.some(t=>t.name===n)):["unknown: tool registry unavailable"];
   if(definition.instructions)p.facts.Instructions=definition.instructions;
   for(const tool of s.tools.filter(t=>definition.tools?.includes(t.name))){edge(p,tool,"requests tool");const membership=tool.facts.Presets??[];tool.facts.Presets=[...(Array.isArray(membership)?membership:[]),name+" ("+scope+")"];}
  }
 }
 const recorded=effectivePresets.get(s.header.preset);
 if(recorded){
  recorded.status.push("recorded preset");
  const differences:string[]=[];
  const requested=recorded.facts["Requested tools"];
  if(r.activeTools&&Array.isArray(requested)&&requested[0]!=="unchanged"&& !sameToolSet(requested,r.activeTools))differences.push("live tools differ from disk preset request");
  if(recorded.facts.Model!=="unchanged"&&recorded.facts.Model!==s.header.model)differences.push("live model differs");
  if(recorded.facts.Thinking!=="unchanged"&&recorded.facts.Thinking!==s.header.thinking)differences.push("live thinking differs");
  recorded.facts["Live differences"]=differences.length?differences:["none observed; recorded name does not prove reapplication"];
 }else if(s.header.preset!=="none recorded")warnings.push("Recorded preset has no effective disk definition; resume/manual edits may differ");
 const mcpEffective=new Map<string,Record<string,unknown>>(),mcpItems=new Map<string,Item>();
 function mcp(name:string,config:unknown,path:string,scope?:string,registration=false){
  const raw=object(config),old=mcpItems.get(name);
  const partial=scope==="project"&&raw.command===undefined&&raw.url===undefined&&raw.type===undefined;
  const invalid=config===null||typeof config!=="object"||Array.isArray(config)||(partial&&(!old||Object.keys(raw).some(k=>!["enabled","exposure","toolExposure"].includes(k))));
  if(invalid){
   const m=item("mcp",s.mcp,name,path,scope);m.status.push("invalid declaration");m.facts.Enabled="unknown";m.facts.Exposure="unknown";m.facts["Connection state"]="unknown; inspect /mcp";warnings.push(path+": invalid MCP declaration or policy override");return;
  }
  const merged=partial?{...mcpEffective.get(name),...raw}:raw;
  const m=item("mcp",s.mcp,name,path,scope);m.status.push(registration?"extension-registered":"configured");if(old){old.status.push("overridden");edge(m,old,partial?"overrides server policy":"replaces server declaration");}
  mcpEffective.set(name,merged);mcpItems.set(name,m);
  m.facts.Enabled=merged.enabled===false?"off":"on";m.facts.Exposure=string(merged.exposure)??"codemode";m.facts["Connection state"]="unknown; inspect /mcp";
  m.facts["Tool exposure overrides"]=Object.entries(object(merged.toolExposure)).filter(([,v])=>typeof v==="string").map(([k,v])=>k+": "+v);
 }
 for(const server of r.mcpRegistrations??[])mcp(server.name,server.config,server.extensionPath??"runtime registration",undefined,true);
 if(!r.mcpRegistrations)warnings.push("extension MCP registration metadata unavailable");
 for(const [path,scope] of [[join(o.agentDir,"mcp.json"),"user"],[join(o.cwd,".pi/mcp.json"),"project"]] as const){
  if(scope==="project"&&!o.trusted)continue;const servers=json(path).mcpServers;
  for(const [name,config] of Object.entries(object(servers)))mcp(name,config,path,scope);
 }
 for(const [name,m] of mcpItems){
  const tools=s.tools.filter(t=>t.name.startsWith("mcp__"+name.replace(/-/g,"_")+"__")||t.facts.Namespace==="mcp__"+name);
  m.facts["Observed registered tools"]=tools.map(t=>t.name);for(const t of tools)edge(m,t,"supplies tool");
 }
 const requestedProviders=new Set(s.presets.flatMap(p=>typeof p.facts.Model==="string"&&p.facts.Model!=="unchanged"?[p.facts.Model.split("/")[0]!]:[]));
 const custom=object(json(join(o.agentDir,"models.json")).providers),providerIds=new Set([...Object.keys(custom),...(r.providers??[]).map(p=>p.id),...requestedProviders,...(r.model?[r.model.provider]:[]),...(string(startup.defaultProvider)?[startup.defaultProvider as string]:[])]);
 if(!r.providers)warnings.push("provider auth/availability metadata unavailable");
 for(const id of providerIds){
  const obs=r.providers?.find(p=>p.id===id),p=item("provider",s.providers,id,id in custom?join(o.agentDir,"models.json"):"runtime model registry");
  p.status.push(id in custom?"custom configured":obs?"catalog":"provider metadata unknown");
  if(requestedProviders.has(id)){p.status.push("preset requested");for(const preset of s.presets)if(typeof preset.facts.Model==="string"&&preset.facts.Model.startsWith(id+"/"))edge(preset,p,"requests model "+preset.facts.Model);}
  if(id===r.model?.provider)p.status.push("current");if(id===startup.defaultProvider)p.status.push("startup default");
  p.facts["Authentication configured"]=obs?.configured===undefined?"unknown":obs.configured?"yes (not remotely validated)":"no";
  p.facts["Auth source"]=obs?.authSource??"unknown";
  p.facts["Available models"]=obs?.available===undefined?"unknown (no credential resolution performed)":String(obs.available)+" (inferred from configured auth; not validated)";
  p.facts["Catalog models"]=obs?.count===undefined?"unknown":String(obs.count);
 }
 return s;
}
