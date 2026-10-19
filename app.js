import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {LAYERS,VISUAL_LAYERS,layoutNodes,scopeFor} from './graph-model.mjs?v=1.1.0';

const $=s=>document.querySelector(s),C=window.GraphCore;
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const split=C.split, storageKey='future-manufacturing-3d-config-v1';
const state={node:null,edge:null,scope:'path',only:false,labels:true,spacing:8.55,tab:'relations',level:'L2',query:'',view:'perspective'};
const host=$('#scene'),labels=$('#labels');
let data,seed,renderer,scene,camera,controls,world,scope,animation=null,hoverId=null,toastTimer,pendingData=null;
let nodeObjects=new Map(),edgeObjects=new Map(),layerLabels=[],pickables=[],labelItems=[],isWebGLReady=false;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const point=new THREE.Vector3(),raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
const color={incoming:'#647bbb',outgoing:'#299f9b',other:'#667c9c'};

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function node(id){return data.nodes.find(n=>n.node_id===id);}
function short(id){return node(id)?.short_title||id;}
function statusLabel(value){return ({'设计示例':'教学内容','公开资料':'公开课程资料','演示数据':'教学演示数据','待补充':'资料待补充'})[value]||value;}
function nodeBadge(n){return n.node_type==='ai'?n.title.split('：')[0]:statusLabel(n.content_status);}
function saveLocal(){try{localStorage.setItem(storageKey,JSON.stringify(data));return true;}catch{toast('浏览器存储不可用，当前图谱仍可使用；请导出配置备份。');return false;}}
function nodeButton(id,label,cls='inline-node'){return `<button class="${cls}" data-node="${escapeHTML(id)}">${escapeHTML(label||short(id))}</button>`;}

function renderCatalog(){
 const query=state.query.trim().toLowerCase();const matches=data.nodes.filter(n=>!query||[n.node_id,n.title,n.short_title,n.description].join(' ').toLowerCase().includes(query));
 $('#catalog-count').textContent=query?`找到 ${matches.length} 个匹配节点`:`${data.nodes.length} 个节点 · 5 个可视层级`;
 $('#node-list').innerHTML=LAYERS.map(l=>{const items=matches.filter(n=>Number(n.layer)===l.id);if(!items.length)return '';return `<details open><summary><span>${l.name}</span><em>${items.length}</em></summary>${items.map(n=>`<button class="node-item ${state.node===n.node_id?'selected':''}" data-node="${escapeHTML(n.node_id)}" aria-pressed="${state.node===n.node_id}" style="--node-color:${l.color}"><span class="color-dot"></span><span>${escapeHTML(n.short_title)}</span>${n.content_status==='待补充'?'<span class="dot pending" title="待补充"></span>':''}</button>`).join('')}</details>`;}).join('')||'<p class="empty-state">没有匹配的节点。请缩短关键词或输入节点编号。</p>';
}
function relationItem(e,incoming){const target=incoming?e.from_id:e.to_id;return `<div class="relation-item"><button class="relation-main" data-node="${escapeHTML(target)}"><small>${incoming?'上游 → 当前':'当前 → 下游'} · ${escapeHTML(e.relation)}</small><strong>${escapeHTML(short(target))}</strong></button><button class="relation-edge" data-edge="${escapeHTML(e.edge_id)}" aria-label="查看关系：${escapeHTML(short(e.from_id)+' → '+short(e.to_id))}">关系</button></div>`;}
function directRelationsHTML(n){const ins=data.edges.filter(e=>e.to_id===n.node_id),outs=data.edges.filter(e=>e.from_id===n.node_id);return `<div class="relation-group"><div class="relation-heading"><span>上游关联</span><b>${ins.length} 项</b></div>${ins.map(e=>relationItem(e,true)).join('')||'<p class="empty-state">这是课程根节点，没有上游。</p>'}</div><div class="relation-group"><div class="relation-heading"><span>下游关联</span><b>${outs.length} 项</b></div>${outs.map(e=>relationItem(e,false)).join('')||'<p class="empty-state">这是依据资源节点，没有下游。</p>'}</div><p class="direction-note">上下游表示教学关系的方向。点击名称切换节点，点击“关系”查看该条连线的含义。</p>`;}
function relationsHTML(n){
 if(state.scope==='direct')return directRelationsHTML(n);
 const traced=scopeFor(data,n.node_id,'path'),layers=LAYERS.map(l=>({...l,items:data.nodes.filter(v=>Number(v.layer)===l.id&&traced.nodes.has(v.node_id))})).filter(l=>l.items.length);
 return `<div class="path-summary">已贯通 <b>${layers.length}</b> 个图层 · <b>${traced.nodes.size}</b> 个节点<span>仅沿已配置的上下游关系追溯</span></div><div class="layer-path">${layers.map(l=>`<section class="path-layer" data-path-layer="${l.id}" style="--path-color:${l.color}"><h3><i></i>${escapeHTML(l.name)}<span>${l.items.length}</span></h3><div class="path-nodes">${l.items.map(v=>`<button data-node="${escapeHTML(v.node_id)}" class="path-node ${v.node_type==='ai'?'ai-node ':''}${v.node_id===n.node_id?'current':''}" aria-current="${v.node_id===n.node_id?'true':'false'}">${v.node_type==='ai'?'<em>AI</em>':''}${escapeHTML(v.node_type==='ai'?v.short_title.replace(/^AI/,''):v.short_title)}</button>`).join('')}</div></section>`).join('')}</div>`;
}
function relationMetrics(n){const traced=scopeFor(data,n.node_id,state.scope);return `<div class="relation-metrics"><span><b>${traced.up.size-1}</b>上游节点</span><span><b>${traced.down.size-1}</b>下游节点</span><span><b>${new Set(data.nodes.filter(v=>traced.nodes.has(v.node_id)).map(v=>v.layer)).size}</b>关联图层</span></div>`;}
function relatedStandards(n){if(n.node_type==='capability')return data.standards.filter(s=>s.capability_id===n.node_id);if(n.node_type==='task')return data.standards.filter(s=>split(s.task_ids).includes(n.node_id));const traced=scopeFor(data,n.node_id,'path');return data.standards.filter(s=>traced.nodes.has(s.capability_id));}
function standardsHTML(n){const list=relatedStandards(n);if(!list.length)return '<p class="empty-state">该节点暂无关联能力标准。请在配置模板中补充能力、任务与证据关系。</p>';const filtered=list.filter(s=>s.level===state.level);return `<div class="level-switch">${['L1','L2','L3'].map(l=>`<button data-level="${l}" class="${state.level===l?'active':''}">${l}</button>`).join('')}</div>${filtered.map(s=>`<div class="standard-section"><h3>${escapeHTML(short(s.capability_id))} · ${escapeHTML(s.level_name)}</h3><p>${escapeHTML(s.goal)}</p></div><div class="standard-section"><h3>达成要求</h3><p>${escapeHTML(s.criteria)}</p></div><div class="standard-section"><h3>关键条件</h3><p>${escapeHTML(s.mandatory_conditions)}</p></div><div class="standard-section"><h3>对应实验任务</h3>${split(s.task_ids).map(id=>nodeButton(id)).join('')}</div>`).join('')||'<p class="empty-state">该等级尚未配置标准。</p>'}<p class="notice">L1–L3 展示由基础操作到复杂问题解决的能力要求。学生达成情况需结合实验记录与教师评价。</p>`;}
function evidenceHTML(n){
 const traced=scopeFor(data,n.node_id,'path');
 const taskIds=new Set(data.nodes.filter(x=>x.node_type==='task'&&traced.nodes.has(x.node_id)).map(x=>x.node_id));
 const evidence=data.evidence.filter(e=>split(e.task_ids).some(id=>taskIds.has(id)));
 const sourceIds=n.node_type==='ai'?new Set(['SRC-PUBLIC',n.source_id]):new Set([n.source_id]);
 const sources=data.sources.filter(s=>sourceIds.has(s.source_id));
 const availability={'可做字段映射':'已有记录，待接入','待补接口':'记录待接入','待确认批阅字段':'教师评价记录待确认'};
 return `${sources.map(source=>`<div class="evidence-item"><h3>${source.source_id==='SRC-DESIGN'?'本实验说明':'参考资料'}</h3><small>${escapeHTML(statusLabel(source.source_type))}</small><p>${escapeHTML(source.title)}</p><p>${escapeHTML(source.description)}</p>${C.isURL(source.url)?`<a class="source-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${source.source_id==='SRC-PUBLIC'?'查看课程介绍':'打开参考资料'}</a>`:''}</div>`).join('')}${evidence.length?'<div class="standard-section"><h3>用于评价的学习记录</h3><p>查看完成了哪些操作、如何分析问题，以及教师如何评价。</p></div>':''}${evidence.map(e=>`<div class="evidence-item"><h3>${escapeHTML(e.title)}</h3><small>${escapeHTML(availability[e.availability]||e.availability)}</small><p>${escapeHTML(e.mapping_rule)}</p><p>记录不完整时：${escapeHTML(e.missing_behavior)}</p></div>`).join('')}${!evidence.length?'<p class="empty-state">该节点尚未关联用于评价的学习记录。</p>':''}<p class="notice">评价结合步骤得分、操作记录和实验报告。记录缺失时不按零分处理；需教师评价的内容，以教师确认结果为准。</p>`;
}
function renderDetail(){
 const d=$('#detail');
 if(state.edge){const e=data.edges.find(e=>e.edge_id===state.edge);d.innerHTML=`<div class="detail-type">关系详情<span class="status-chip">有向关联</span></div><h2 class="detail-title">${escapeHTML(e.relation)}</h2><div class="edge-detail-chain">${nodeButton(e.from_id,node(e.from_id).title)}<span>↓ ${escapeHTML(e.relation)}</span>${nodeButton(e.to_id,node(e.to_id).title)}</div><p class="detail-description">${escapeHTML(e.description||'这条关联连接两个教学内容节点。')}</p><p class="detail-id">${escapeHTML(e.edge_id)}</p><button class="focus-button" data-action="focus-edge">聚焦这条关联</button><p class="notice">关系方向以起点 → 终点为准，第四层展示知识与AI应用，第五层展示产业数据与案例依据。</p>`;return;}
 const n=node(state.node);if(!n){d.innerHTML=`<div class="detail-type">全图概览</div><h2 class="detail-title">从培养目标到实验资料，逐层展开</h2><p class="detail-description">点击三维节点、节点目录或任意连线，查看教学内容之间的关系。</p><div class="standard-section"><h3>${data.nodes.length} 个节点 · ${data.edges.length} 条关联</h3><p>实验培养目标 → 能力目标 → 实验任务 → 知识与AI应用 → 产业数据与案例依据</p></div><div class="standard-section"><h3>快速体验</h3>${data.nodes.filter(n=>n.node_type==='capability').map(n=>nodeButton(n.node_id,n.title)).join('')}</div><p class="notice">以轴与轴套生产为背景，查看产线设计、调试和优化任务，以及所需知识、AI引导与参考资料。</p>`;return;}
 d.innerHTML=`<div class="detail-type">${LAYERS[Number(n.layer)-1].name}<span class="status-chip">${escapeHTML(nodeBadge(n))}</span></div><h2 class="detail-title">${escapeHTML(n.title)}</h2><p class="detail-description">${escapeHTML(n.description)}</p>${relationMetrics(n)}<div class="detail-tools"><p class="detail-id">${escapeHTML(n.node_id)}</p><button class="focus-button" data-action="focus-node">聚焦此节点</button></div><div class="detail-tabs" role="tablist" aria-label="节点详情">${[['relations','关联'],['standards','能力阶梯'],['evidence','学习记录与资料']].map(([id,title])=>`<button role="tab" data-tab="${id}" aria-selected="${state.tab===id}">${title}</button>`).join('')}</div><div role="tabpanel">${state.tab==='relations'?relationsHTML(n):state.tab==='standards'?standardsHTML(n):evidenceHTML(n)}</div>`;
}
function fitFrame(){if(!isWebGLReady)return;resize();const distance=Math.max(70,22+29/(.7*Math.tan(Math.PI/9)*camera.aspect)),direction=camera.position.clone().sub(controls.target).normalize();moveCamera(direction.multiplyScalar(distance),new THREE.Vector3());}
function openDetail(){const wasClosed=$('.detail-panel').hidden;$('.detail-panel').hidden=false;$('.workspace').classList.add('detail-open');$('.detail-panel').scrollTop=0;if(wasClosed)requestAnimationFrame(fitFrame);}
function closeDetail(){ $('.detail-panel').hidden=true; $('.workspace').classList.remove('detail-open'); state.node=null;state.edge=null;state.only=false;$('#only-related').checked=false;refresh();requestAnimationFrame(fitFrame); }
function selectNode(id){if(!node(id))return;state.node=id;state.edge=null;state.scope='path';state.tab='relations';hoverId=null;$('#hover-tip').hidden=true;refresh();$('.catalog').classList.remove('open');openDetail();}
function selectEdge(id){if(!data.edges.some(e=>e.edge_id===id))return;state.edge=id;state.node=null;hoverId=null;$('#hover-tip').hidden=true;refresh();openDetail();}
function refresh(){
 scope=scopeFor(data,state.node,state.scope,state.edge);renderCatalog();renderDetail();
 $('#course-title').textContent=data.project[0].title;
 const selected=node(state.node),edge=data.edges.find(e=>e.edge_id===state.edge);
 $('#scene-caption').textContent=selected?selected.short_title:edge?edge.relation:'五层教学关系';
 $('#scene-subtitle').textContent=edge?`${short(edge.from_id)} → ${short(edge.to_id)}`:selected?(state.scope==='direct'?'聚焦当前节点与直接相连的内容':'沿上下游追溯到培养目标与依据资源'):'从课程目标追溯到实验任务与数据依据';
 $('#graph-stats').textContent=`${scope.nodes.size}/${data.nodes.length} 节点 · ${scope.edges.size}/${data.edges.length} 关联`;
 document.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.scope===state.scope));
 host.dataset.selectedNode=state.node||'';host.dataset.selectedEdge=state.edge||'';host.dataset.scope=state.scope;host.dataset.relatedNodes=scope.nodes.size;host.dataset.relatedEdges=scope.edges.size;host.dataset.relatedLayers=[...new Set(data.nodes.filter(n=>scope.nodes.has(n.node_id)).map(n=>n.layer))].sort().join(',');
 if(isWebGLReady)applyAppearance();
}

function initializeThree(){
 try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xdde5f0,0);renderer.domElement.setAttribute('aria-hidden','true');host.prepend(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.1,500);camera.position.set(0,0,80);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=25;controls.maxDistance=450;controls.maxPolarAngle=Math.PI*.91;controls.autoRotateSpeed=.35;controls.target.set(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8797b1,2.3));const light=new THREE.DirectionalLight(0xffffff,1.4);light.position.set(10,20,30);scene.add(light);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();isWebGLReady=false;$('#fallback').hidden=false;host.dataset.ready='context-lost';});
  isWebGLReady=true;host.dataset.ready='true';buildWorld();new ResizeObserver(resize).observe(host);resize();resetView(false);bindPointer();renderer.setAnimationLoop(animate);
 }catch(error){$('#fallback').hidden=false;host.dataset.ready='false';console.error('WebGL initialization:',error);}
 $('#scene-loading').hidden=true;
}
function disposeWorld(){if(!world)return;scene.remove(world);world.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});labels.replaceChildren();nodeObjects.clear();edgeObjects.clear();layerLabels=[];labelItems=[];pickables=[];}
function buildWorld(){
 if(!isWebGLReady)return;disposeWorld();world=new THREE.Group();scene.add(world);const positions=layoutNodes(data.nodes,state.spacing);
 for(const l of VISUAL_LAYERS){
  const y=(3-l.id)*state.spacing;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(58,44),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.67,side:THREE.DoubleSide,depthWrite:false}));plane.rotation.x=-Math.PI/2;plane.position.y=y;plane.renderOrder=-10;world.add(plane);
  const edge=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-29,y,22),new THREE.Vector3(29,y,22)]),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.93,depthWrite:false}));world.add(edge);
  const el=document.createElement('div');el.className='layer-label';el.style.setProperty('--layer-color',l.color);el.textContent=l.name;labels.append(el);layerLabels.push({el,position:new THREE.Vector3(-29,y,22)});
 }
 const palette=['#9374e4','#46b3e4','#31caa2','#edc957','#ef9295','#31caa2'];
 for(const [i,n] of data.nodes.entries()){
  const p=positions.get(n.node_id),l=LAYERS[Number(n.layer)-1];
  const radius=n.node_type==='course'?.65:n.node_type==='capability'?.33:n.node_type==='task'?.28:n.node_type==='ai'?.23:.14;
  const taskIndex=data.nodes.filter(v=>v.node_type==='task').findIndex(v=>v.node_id===n.node_id);
  const fill=n.node_type==='ai'?'#8266c8':n.layer>=4?palette[i%palette.length]:n.node_type==='task'?['#70b8c8','#70b8c8','#c89f72','#c89f72','#8974ce','#8974ce'][taskIndex%6]:l.color;
  const geometry=(n.node_type==='course'||n.node_type==='ai')?new THREE.OctahedronGeometry(radius):n.node_type==='capability'?new THREE.ConeGeometry(radius,.85,14):new THREE.SphereGeometry(radius,16,12);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:fill,roughness:.65,metalness:0,transparent:true}));mesh.position.set(p.x,p.y,p.z);mesh.userData={kind:'node',id:n.node_id};world.add(mesh);pickables.push(mesh);
  const halo=new THREE.Mesh(new THREE.RingGeometry(radius+.17,radius+.22,48),new THREE.MeshBasicMaterial({color:0x8974ce,transparent:true,opacity:.8,side:THREE.DoubleSide,depthTest:false}));halo.position.copy(mesh.position);halo.visible=false;world.add(halo);
  const el=document.createElement('button');el.className='node-label';el.textContent=n.short_title;el.title=n.title;el.dataset.node=n.node_id;el.dataset.layer=n.layer;el.dataset.type=n.node_type;el.setAttribute('aria-label',n.title);labels.append(el);
  const obj={mesh,halo,el,data:n,radius};nodeObjects.set(n.node_id,obj);labelItems.push(obj);
 }
 for(const e of data.edges){const a=nodeObjects.get(e.from_id).mesh.position,b=nodeObjects.get(e.to_id).mesh.position,curve=new THREE.LineCurve3(a.clone(),b.clone());
  const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(1)),new THREE.LineBasicMaterial({color:color.other,transparent:true,opacity:.24,depthWrite:false}));mesh.userData={kind:'edge',id:e.edge_id};world.add(mesh);pickables.push(mesh);edgeObjects.set(e.edge_id,{mesh,curve,data:e});
 }
 raycaster.params.Line.threshold=.11;applyAppearance();
}
function applyAppearance(){
 const active=!!(state.node||state.edge);let visibleNodes=0,visibleEdges=0;
 for(const [id,o]of nodeObjects){const relevant=scope.nodes.has(id);o.mesh.visible=!state.only||relevant;o.mesh.material.opacity=active&&!relevant?.18:1;o.mesh.scale.setScalar(state.node===id?1.25:1);o.halo.visible=state.node===id;o.el.className='node-label'+(state.node===id?' selected':relevant&&active?' related':'');o.el.setAttribute('aria-pressed',state.node===id);if(o.mesh.visible)visibleNodes++;}
 for(const [id,o]of edgeObjects){const relevant=scope.edges.has(id),incoming=state.edge?true:scope.up.has(o.data.from_id)&&scope.up.has(o.data.to_id);o.mesh.material.color.set(active&&relevant?(incoming?color.incoming:color.outgoing):color.other);o.mesh.material.opacity=active?(relevant?.8:.065):.32;o.mesh.visible=!state.only||relevant;if(o.mesh.visible)visibleEdges++;}
 $('#edge-label').hidden=!state.edge;const e=data.edges.find(e=>e.edge_id===state.edge);if(e)$('#edge-label').textContent=e.relation;
 host.dataset.visibleNodes=visibleNodes;host.dataset.visibleEdges=visibleEdges;
}
function resize(){if(!isWebGLReady)return;const w=host.clientWidth,h=host.clientHeight,previous=camera.aspect,next=w/h;renderer.setSize(w,h,false);if(Math.abs(next-previous)>.001){const fit=a=>Math.max(70,22+29/(.7*Math.tan(Math.PI/9)*a));const offset=camera.position.clone().sub(controls.target).multiplyScalar(fit(next)/fit(previous));camera.position.copy(controls.target).add(offset);animation=null;}camera.aspect=next;camera.updateProjectionMatrix();}
function moveCamera(position,target,duration=550){const end=position.clone();if(reducedMotion||duration===0){camera.position.copy(end);controls.target.copy(target);controls.update();animation=null;return;}animation={start:performance.now(),duration,from:camera.position.clone(),to:end,fromTarget:controls.target.clone(),target:target.clone()};}
function resetView(smooth=true){if(!isWebGLReady)return;const distance=Math.max(70,22+29/(.7*Math.tan(Math.PI/9)*camera.aspect));const offset=state.view==='top'?new THREE.Vector3(0,distance,.1):state.view==='front'?new THREE.Vector3(0,0,distance+10):new THREE.Vector3(0,distance*.035,distance);moveCamera(offset,new THREE.Vector3(),smooth?500:0);}
function focusNode(){if(!isWebGLReady||!nodeObjects.has(state.node))return;const target=nodeObjects.get(state.node).mesh.position.clone();const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(44*Math.max(1,.8/camera.aspect));moveCamera(target.clone().add(offset),target);}
function focusEdge(){if(!isWebGLReady||!edgeObjects.has(state.edge))return;const edge=edgeObjects.get(state.edge);const target=edge.curve.getPoint(.5);const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(45);moveCamera(target.clone().add(offset),target);}
function projected(position){point.copy(position).project(camera);return {x:(point.x*.5+.5)*host.clientWidth,y:(-.5*point.y+.5)*host.clientHeight,z:point.z};}
function intersects(a,b){return a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;}
function updateLabels(){
 const placed=[],active=!!(state.node||state.edge),w=host.clientWidth,h=host.clientHeight;
 for(const o of layerLabels){const corners=[[-29,22],[-29,-22],[29,22],[29,-22]].map(([x,z])=>projected(new THREE.Vector3(x,o.position.y,z)));const p=corners.sort((a,b)=>a.x-b.x)[0],labelWidth=o.el.textContent.length*(innerWidth<700?10:innerWidth>=1700?16:13)+24,r={x:p.x+3,y:p.y-22,w:labelWidth,h:22};o.el.hidden=p.z< -1||p.z>1||r.x<0||r.x>w-labelWidth||r.y<50||r.y>h-35;if(!o.el.hidden){o.el.style.transform=`translate(${r.x}px,${r.y}px)`;placed.push(r);}}
 const prioritized=[...labelItems].sort((a,b)=>{const score=o=>(o.data.node_id===state.node?100:0)+(scope.nodes.has(o.data.node_id)?30:0)+(o.data.node_type==='ai'?12:0)+(6-Number(o.data.layer));return score(b)-score(a);});
 for(const o of prioritized){o.halo.quaternion.copy(camera.quaternion);const p=projected(o.mesh.position),relevant=scope.nodes.has(o.data.node_id),size=o.data.layer===1?15:o.data.layer===2?12:o.data.layer===3?11:o.data.node_type==='ai'?10:9;const width=Math.max(48,o.el.textContent.length*size+8),height=size+8;
  const choices=[{x:p.x-width/2,y:p.y-height-10},{x:p.x-width/2,y:p.y+10}].map(r=>({...r,w:width,h:height}));
  const rect=choices.find(r=>r.x>5&&r.x+width<w-5&&r.y>60&&r.y+height<h-52&&!placed.some(other=>intersects(r,other)));
  o.el.hidden=!(state.labels&&o.mesh.visible&&(!active||relevant)&&p.z>-1&&p.z<1&&rect);
  if(!o.el.hidden){placed.push(rect);o.el.style.transform=`translate(${rect.x}px,${rect.y}px)`;o.el.style.width=width+'px';o.el.style.fontSize=size+'px';}
 }
 if(state.edge){const e=edgeObjects.get(state.edge),p=projected(e.curve.getPoint(.5));const el=$('#edge-label');el.hidden=p.z< -1||p.z>1||p.y<50||p.y>h-50;el.style.left=p.x+'px';el.style.top=p.y+'px';}
}
function animate(now){if(!isWebGLReady)return;if(animation){const t=Math.min(1,(now-animation.start)/animation.duration),v=1-Math.pow(1-t,3);camera.position.lerpVectors(animation.from,animation.to,v);controls.target.lerpVectors(animation.fromTarget,animation.target,v);if(t===1)animation=null;}controls.update();updateLabels();renderer.render(scene,camera);host.dataset.cameraPose=[camera.position.x,camera.position.y,camera.position.z].map(x=>x.toFixed(2)).join(',');}
function hit(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(mouse,camera);const matches=raycaster.intersectObjects(pickables.filter(o=>o.visible),false);return matches.find(h=>h.object.userData.kind==='node')||matches.find(h=>scope.edges.has(h.object.userData.id))||matches[0];}
function bindPointer(){let start=null,dragging=false;const canvas=renderer.domElement;canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};dragging=false;animation=null;});canvas.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)dragging=true;if(dragging){$('#hover-tip').hidden=true;return;}const target=hit(e);canvas.style.cursor=target?'pointer':'grab';if(!target){$('#hover-tip').hidden=true;hoverId=null;return;}const info=target.object.userData;hoverId=info.id;const title=info.kind==='node'?node(info.id).title:(()=>{const edge=data.edges.find(x=>x.edge_id===info.id);return `${short(edge.from_id)} → ${edge.relation} → ${short(edge.to_id)}`;})();const tip=$('#hover-tip');tip.textContent=title;tip.hidden=false;const rect=host.getBoundingClientRect();tip.style.left=Math.max(10,Math.min(e.clientX-rect.left+14,rect.width-270))+'px';tip.style.top=Math.max(110,Math.min(e.clientY-rect.top+12,rect.height-100))+'px';});canvas.addEventListener('pointerup',e=>{if(start&&!dragging&&e.button===0){const h=hit(e);if(h){const d=h.object.userData;d.kind==='node'?selectNode(d.id):selectEdge(d.id);}}start=null;dragging=false;});canvas.addEventListener('pointercancel',()=>{start=null;dragging=false;});canvas.addEventListener('pointerleave',()=>{$('#hover-tip').hidden=true;});}

document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.node)selectNode(b.dataset.node);if(b.dataset.edge)selectEdge(b.dataset.edge);if(b.dataset.tab){state.tab=b.dataset.tab;renderDetail();}if(b.dataset.level){state.level=b.dataset.level;renderDetail();}if(b.dataset.scope){state.scope=b.dataset.scope;refresh();}if(b.dataset.view){state.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',x===b));resetView();}if(b.dataset.action==='focus-node')focusNode();if(b.dataset.action==='focus-edge')focusEdge();});
$('#search').addEventListener('input',e=>{state.query=e.target.value;renderCatalog();});$('#search').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('#node-list [data-node]');if(first)selectNode(first.dataset.node);}});
$('#clear-selection').onclick=closeDetail;$('#detail-close').onclick=closeDetail;
$('#only-related').onchange=e=>{state.only=e.target.checked;if(isWebGLReady)applyAppearance();};$('#show-labels').onchange=e=>state.labels=e.target.checked;$('#auto-rotate').onchange=e=>{if(controls)controls.autoRotate=e.target.checked;};
$('#layer-spacing').oninput=e=>{state.spacing=Number(e.target.value);if(isWebGLReady)buildWorld();};
$('#reset-view').onclick=()=>resetView();$('#zoom-in').onclick=()=>zoom(.8);$('#zoom-out').onclick=()=>zoom(1.25);function zoom(factor){if(!isWebGLReady)return;const offset=camera.position.clone().sub(controls.target);const distance=THREE.MathUtils.clamp(offset.length()*factor,25,450);moveCamera(controls.target.clone().add(offset.normalize().multiplyScalar(distance)),controls.target,200);}
$('#catalog-open').onclick=()=>$('.catalog').classList.add('open');$('#catalog-close').onclick=()=>$('.catalog').classList.remove('open');$('#retry').onclick=()=>location.reload();
host.addEventListener('keydown',e=>{if(e.target!==host)return;const moves={ArrowLeft:-.15,ArrowRight:.15};if(e.key in moves&&isWebGLReady){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),moves[e.key]);moveCamera(controls.target.clone().add(offset),controls.target,100);e.preventDefault();}if(e.key==='+'||e.key==='='){zoom(.8);e.preventDefault();}if(e.key==='-'){zoom(1.25);e.preventDefault();}if(e.key==='Escape')$('#clear-selection').click();});
$('#import-open').onclick=()=>{$('#import-dialog').showModal();};
$('#file-input').onchange=async e=>{pendingData=null;$('#apply-import').disabled=true;const file=e.target.files[0];if(!file)return;const result=$('#import-result');result.textContent='正在解析并校验…';try{if(file.size>2*1024*1024)throw Error('文件超过 2MB，请精简配置后导入。');const ext=file.name.split('.').pop().toLowerCase();let input;if(ext==='json')input=JSON.parse(await file.text());else if(ext==='csv')input=C.fromFlat(TableReader.csv(await file.text()));else if(ext==='xlsx')input=await TableReader.xlsx(await file.arrayBuffer());else throw Error('请选择 .xlsx、.csv 或 .json 文件。');const check=C.validate(input);if(!check.valid){result.innerHTML=`<strong class="error">校验未通过，当前图谱未改变</strong><ul>${check.errors.slice(0,12).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`;return;}pendingData=check.data;result.innerHTML=`<strong>校验通过：${pendingData.nodes.length} 个节点，${pendingData.edges.length} 条关系</strong><ul>${check.warnings.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`;$('#apply-import').disabled=false;}catch(error){result.textContent=error.message;}};
$('#apply-import').onclick=()=>{if(!pendingData)return;data=pendingData;pendingData=null;state.scope='path';$('.detail-panel').hidden=true;$('.workspace').classList.remove('detail-open');state.node=null;state.edge=null;state.query='';$('#search').value='';refresh();if(isWebGLReady){buildWorld();resetView();}const saved=saveLocal();$('#import-dialog').close();$('#apply-import').disabled=true;toast(saved?'已应用并保存到当前浏览器。':'已应用到本次页面，请导出配置备份。');};
$('#restore-sample').onclick=()=>{data=structuredClone(seed);$('.detail-panel').hidden=true;$('.workspace').classList.remove('detail-open');state.node=null;state.edge=null;state.scope='path';state.only=false;state.query='';$('#search').value='';$('#only-related').checked=false;refresh();if(isWebGLReady){buildWorld();resetView();}saveLocal();pendingData=null;$('#apply-import').disabled=true;$('#file-input').value='';$('#import-result').textContent='已恢复原始示例。';$('#import-dialog').close();toast('已恢复未来制造示例数据。');};
$('#export-data').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='未来制造三维图谱配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

try{const response=await fetch('./data/graph-data.json',{cache:'no-store'});if(!response.ok)throw Error('示例数据读取失败');seed=await response.json();data=structuredClone(seed);try{const saved=localStorage.getItem(storageKey);if(saved){const check=C.validate(JSON.parse(saved));if(check.valid){data=check.data;try{const migration=await (await fetch('./data/sample-upgrade.json',{cache:'no-store'})).json();const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(check.data))),hash=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');if((migration.previousSampleHashes||[migration.previousSampleHash]).includes(hash)){localStorage.setItem(storageKey+'-backup-'+check.data.project[0].version,saved);data=structuredClone(seed);saveLocal();toast('课程介绍已更新：查看实验前、实验中、实验后的任务与AI引导。');}}catch{}}}}catch{}const validation=C.validate(data);if(!validation.valid)throw Error(validation.errors.join('；'));data=validation.data;refresh();initializeThree();}catch(error){$('#scene-loading').textContent='图谱载入失败：'+error.message;host.dataset.ready='false';console.error(error);}
