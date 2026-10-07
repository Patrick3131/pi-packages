import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectOverview } from "./collect.js";
import { renderOverview } from "./html.js";
import { handleOverview } from "./index.js";
import { packageIdentity } from "./normalize.js";

function fixture(t: { after(fn: () => void): void }) {
 const base = mkdtempSync(join(tmpdir(), "pi-overview-test-")); t.after(() => rmSync(base, {recursive:true,force:true}));
 const agentDir = join(base,"agent"), cwd=join(base,"repo"); mkdirSync(agentDir); mkdirSync(join(cwd,".pi"),{recursive:true});
 const put=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value));
 put(join(agentDir,"settings.json"),{packages:["git:github.com/Patrick3131/pi-packages"],defaultProvider:"old",defaultModel:"default"});
 put(join(cwd,".pi/settings.json"),{packages:[{source:"git:github.com/Patrick3131/pi-packages",extensions:[],skills:[],prompts:[],themes:[]},".."]});
 put(join(cwd,"package.json"),{name:"pi-packages",version:"0.1",pi:{extensions:["toolkit.ts"]}});
 const runtime={tools:[{name:"read",description:"read",exposure:"direct",sourceInfo:{path:"builtin:read",source:"builtin",scope:"user"}},{name:"indirect",exposure:"deferred"},{name:"hidden",exposure:"hidden"}],activeTools:["read"],commands:[{name:"preset",source:"extension",sourceInfo:{path:join(cwd,"toolkit.ts"),source:"..",scope:"project",baseDir:cwd}}],model:{provider:"current",id:"actual"},thinking:"high",presets:[{type:"custom",customType:"preset-state",data:{name:"plan"}}],providers:[{id:"current",configured:true,authSource:"environment",available:2}],mcpRegistrations:[],skills:[],hiddenTools:[]};
 return {base,agentDir,cwd,put,runtime,options:{agentDir,cwd,trusted:true,runtime,generatedAt:"2026-10-07T00:00:00Z"}};
}

test("package provenance distinguishes declaration filtering, local checkout and observed ownership",t=>{
 const f=fixture(t);const s=collectOverview(f.options);
 assert.equal(packageIdentity("npm:@org/pkg@2","/a"),packageIdentity("npm:@org/pkg@1","/b"));
 assert.equal(packageIdentity("git:github.com/Org/repo@v2","/a"),packageIdentity("https://github.com/Org/repo.git#v1","/b"));
 assert.ok(s.packages.some(p=>p.status.includes("overridden")));
 assert.ok(s.packages.some(p=>p.status.includes("filtered")&&p.scope==="project"));
 const local=s.packages.find(p=>p.facts["Installation path"]===f.cwd);assert.ok(local);
 assert.ok(s.relationships.some(r=>r.to===s.commands[0]?.id));
 f.put(join(f.cwd,".pi/settings.json"),{packages:[{source:"git:github.com/Patrick3131/pi-packages",autoload:false,extensions:[]}]});
 assert.ok(collectOverview(f.options).packages.some(p=>p.status.includes("filter delta")));
});

test("preset override and live state are separate; inactive deferred is reachable but hidden is not",t=>{
 const f=fixture(t);f.put(join(f.agentDir,"presets.json"),{plan:{tools:["read"],provider:"old",model:"old",instructions:"old"}});
 f.put(join(f.cwd,".pi/presets.json"),{plan:{tools:["indirect","missing"],thinkingLevel:"medium"}});
 f.put(join(f.cwd,".pi/tools.json"),{read:false,indirect:true});
 const s=collectOverview(f.options),p=s.presets.find(p=>p.name==="plan"&&p.scope==="project")!;
 assert.equal(p.facts.Model,"unchanged");assert.deepEqual(p.facts["Unregistered tools"],["missing"]);assert.ok(p.status.includes("recorded preset"));
 assert.ok(p.facts["Live differences"]);assert.equal(s.tools[0]?.facts["Saved project preference"],"off");
 assert.equal(s.tools.find(p=>p.name==="indirect")?.facts.Reachability,"indirectly callable even when inactive");
 assert.equal(s.tools.find(p=>p.name==="hidden")?.facts.Reachability,"unreachable");
 assert.ok(s.relationships.some(e=>e.label==="requests model old/old"));
 assert.equal(s.relationships.some(e=>e.from===p.id&&e.label.startsWith("requests model")),false);
});

test("allowlisted projection removes secrets and HTML cannot execute user markup",t=>{
 const f=fixture(t);const secret="SECRET_SENTINEL_123";
 f.put(join(f.agentDir,"mcp.json"),{mcpServers:{docs:{url:"https://user:"+secret+"@example.com",headers:{Authorization:secret},env:{KEY:secret},args:[secret]}}});
 f.put(join(f.agentDir,"models.json"),{providers:{custom:{apiKey:secret,baseUrl:"https://"+secret,models:[{id:"safe"}]}}});
 f.put(join(f.agentDir,"settings.json"),{packages:["https://user:"+secret+"@github.com/Org/repo?token="+secret,"npm:https://user:"+secret+"@example.com/pkg","custom:http://user:"+secret+"@example.com/pkg"],apiKey:secret});
 f.put(join(f.agentDir,"presets.json"),{plan:{instructions:'</script><img src=x onerror="alert(1)">',tools:["read"]}});
 f.runtime.tools[0]!.description='<script>alert("bad")</script>';
 const s=collectOverview(f.options),html=renderOverview(s);
 assert.equal(JSON.stringify(s).includes(secret),false); assert.equal(html.includes(secret),false);
 assert.ok(html.includes("&lt;script&gt;"));assert.equal(html.includes('<img src=x'),false);assert.equal(html.includes('src="https://'),false);
});

test("partial state warnings do not hide trust/API gaps as empty; disk and live remain separate",t=>{
 const f=fixture(t);writeFileSync(join(f.agentDir,"mcp.json"),"not JSON SECRET_RAW");
 const s=collectOverview({...f.options,trusted:false,runtime:{...f.runtime,tools:undefined,providers:undefined}});
 assert.ok(s.warnings.some(w=>w.includes("project scope withheld")));assert.ok(s.warnings.some(w=>w.includes("tool registry unavailable")));
 assert.equal(JSON.stringify(s).includes("SECRET_RAW"),false);assert.equal(s.packages.some(p=>p.scope==="project"),false);
 assert.equal(s.header.model,"current/actual");assert.equal(s.header.defaultModel,"old/default");
 const partial=collectOverview({...f.options,runtime:{...f.runtime,activeTools:undefined,hiddenTools:undefined}});
 assert.ok(partial.tools[0]!.status.includes("active state unknown"));assert.equal(partial.tools[0]!.facts["Direct declaration"],"unknown");
});

test("command snapshot is read-only, rejects flags, safe path and browser failure preserve report",async t=>{
 const f=fixture(t);const notes:string[]=[];let launches=0;
 let forbiddenCalls=0;
 const forbidden=()=>{forbiddenCalls++;throw Error("forbidden mutation/auth/network")};
 const originalRead=fs.readFileSync;
 t.mock.method(fs,"readFileSync",(path:unknown,...args:unknown[])=>{if(String(path).endsWith("auth.json"))return forbidden();return Reflect.apply(originalRead,fs,[path,...args]);});
 t.mock.method(globalThis,"fetch",async()=>forbidden());
 syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 const pi={getAllTools:()=>f.runtime.tools,getActiveTools:()=>f.runtime.activeTools,getCommands:()=>f.runtime.commands,getThinkingLevel:()=>"high",getSettings:()=>({}),getMcpServers:()=>[],exec:async()=>{launches++;throw Error("no browser")},setModel:forbidden,setActiveTools:forbidden,appendEntry:forbidden};
 const ctx={cwd:f.cwd,mode:"tui",isProjectTrusted:()=>true,model:f.runtime.model,sessionManager:{getSessionId:()=>"../../escape",getBranch:()=>f.runtime.presets},getSystemPromptOptions:()=>({skills:[],hiddenTools:[]}),modelRegistry:{getAll:()=>[],getAvailable:forbidden,getApiKeyForProvider:forbidden,getProviderAuthStatus:()=>({configured:true,source:"stored"})},ui:{notify:(s:string)=>notes.push(s)}};
 const file=await handleOverview(pi,ctx,"",{agentDir:f.agentDir});assert.ok(file);assert.equal(launches,1);assert.ok(file.startsWith(join(f.agentDir,"overview")));assert.ok(readFileSync(file,"utf8").includes("My Pi"));
 const before=readFileSync(join(f.agentDir,"settings.json"),"utf8");
 await handleOverview(pi,{...ctx,mode:"rpc"},"",{agentDir:f.agentDir});assert.equal(launches,1);
 assert.equal(await handleOverview(pi,ctx,"--text",{agentDir:f.agentDir}),undefined);
 assert.equal(readFileSync(join(f.agentDir,"settings.json"),"utf8"),before);assert.ok(notes.some(s=>s.includes(file)));
 assert.equal(await handleOverview(pi,{...ctx,mode:"rpc"},"",{agentDir:f.agentDir,outputDir:join(f.agentDir,"settings.json","no-directory")}),undefined);
 assert.ok(notes.some(s=>s.includes("unable to write HTML")));
 assert.equal(await handleOverview(pi,{...ctx,mode:"rpc",getSystemPromptOptions:undefined,isProjectTrusted:undefined},"",{agentDir:f.agentDir})!==undefined,true);
 assert.equal(forbiddenCalls,0);
});
