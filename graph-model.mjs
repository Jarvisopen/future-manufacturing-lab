export const LAYERS=[
 {id:1,name:'实验培养目标',color:'#4e60a2'},
 {id:2,name:'能力目标',color:'#32c5ba'},
 {id:3,name:'实验任务',color:'#8974ce'},
 {id:4,name:'知识与AI应用',color:'#548941'},
 {id:5,name:'产业数据与案例依据',color:'#c99b6d'}
];
export const VISUAL_LAYERS=LAYERS;
export function layoutNodes(nodes,spacing=8.55){
 const positions=new Map();
 const ordered=items=>items.sort((a,b)=>a.sort_order-b.sort_order||a.node_id.localeCompare(b.node_id));
 for(const layer of VISUAL_LAYERS){
  const items=ordered(nodes.filter(n=>Number(n.layer)===layer.id));
  items.forEach((n,i)=>{
   let x=0,z=4;
   if(layer.id===1)x=(i-(items.length-1)/2)*8;
   if(layer.id===2){x=items.length===1?0:(i/(items.length-1)-.5)*18;z=(i===0||i===items.length-1)?8:-7;}
   if(layer.id===3){x=items.length===1?0:(i/(items.length-1)-.5)*36;z=Math.abs(x)/18*20-12;}
   if(layer.id===4){const groups=['knowledge','model','ai'].map(type=>items.filter(v=>v.node_type===type)).filter(g=>g.length);const groupIndex=groups.findIndex(g=>g.some(v=>v.node_id===n.node_id)),group=groups[groupIndex],index=group.findIndex(v=>v.node_id===n.node_id);x=group.length===1?0:(index/(group.length-1)-.5)*36;z=groups.length===1?0:-14+groupIndex*28/(groups.length-1);}
   if(layer.id===5){const columns=Math.ceil(items.length/2),row=Math.floor(i/columns),count=Math.min(columns,items.length-row*columns);x=count===1?0:(i%columns/(count-1)-.5)*36+(row%2?1:0);z=-10+row*20;}
   positions.set(n.node_id,{x,y:(3-layer.id)*spacing+.25,z});
  });
 }
 return positions;
}
export function scopeFor(data,nodeId,mode='path',edgeId=null){
 const nodeIds=new Set(data.nodes.map(n=>n.node_id));
 if(edgeId){const e=data.edges.find(e=>e.edge_id===edgeId);return e?{nodes:new Set([e.from_id,e.to_id]),edges:new Set([e.edge_id]),up:new Set([e.from_id]),down:new Set([e.to_id])}:{nodes:new Set(),edges:new Set(),up:new Set(),down:new Set()};}
 if(!nodeId||!nodeIds.has(nodeId))return {nodes:nodeIds,edges:new Set(data.edges.map(e=>e.edge_id)),up:new Set(),down:new Set()};
 const up=new Set([nodeId]),down=new Set([nodeId]);
 if(mode==='direct'){for(const e of data.edges){if(e.to_id===nodeId)up.add(e.from_id);if(e.from_id===nodeId)down.add(e.to_id);}}
 else {let changed=true;while(changed){changed=false;for(const e of data.edges){if(up.has(e.to_id)&&!up.has(e.from_id)){up.add(e.from_id);changed=true;}if(down.has(e.from_id)&&!down.has(e.to_id)){down.add(e.to_id);changed=true;}}}}
 const nodes=new Set([...up,...down]);const edges=new Set(data.edges.filter(e=>mode==='direct'?(e.to_id===nodeId||e.from_id===nodeId):((up.has(e.from_id)&&up.has(e.to_id))||(down.has(e.from_id)&&down.has(e.to_id)))).map(e=>e.edge_id));
 return {nodes,edges,up,down};
}
