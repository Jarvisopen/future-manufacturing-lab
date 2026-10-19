(function(root){
  'use strict';
  const fields={
    project:['project_id','schema_version','version','title','short_title','direction','discipline','reference_institution','description','source_id','content_status'],
    nodes:['node_id','layer','node_type','short_title','title','description','source_id','content_status','sort_order'],
    edges:['edge_id','from_id','to_id','relation','description','source_id'],
    standards:['standard_id','capability_id','level','level_name','goal','elements','criteria','task_ids','evidence_ids','mandatory_conditions','review_mode','source_id'],
    evidence:['evidence_id','title','task_ids','source_type','source_fields','mapping_rule','availability','missing_behavior','source_id'],
    sources:['source_id','title','source_type','url','description','checked_on']
  };
  const keys={project:'project_id',nodes:'node_id',edges:'edge_id',standards:'standard_id',evidence:'evidence_id',sources:'source_id'};
  const sheetNames={project:'项目',nodes:'节点',edges:'关系',standards:'能力标准',evidence:'证据映射',sources:'来源'};
  const types={course:1,capability:2,task:3,knowledge:4,model:4,ai:4,resource:5};
  const status=['公开资料','设计示例','演示数据','待补充'];
  const split=value=>String(value||'').split(';').map(x=>x.trim()).filter(Boolean);
  const isURL=value=>{try {return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
  function validate(input){
    const errors=[],warnings=[],data={};
    const issue=(table,index,message)=>errors.push(`${sheetNames[table]||table} · 第${index+2}行：${message}`);
    if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,errors:['数据必须是包含六类记录的JSON对象'],warnings,data:null};
    for(const table of Object.keys(fields)){
      if(!Array.isArray(input[table])){errors.push(`缺少${sheetNames[table]}表（${table}）`);data[table]=[];continue;}
      if(input[table].length>2000){errors.push(`${sheetNames[table]}超过演示支持的2000行`);data[table]=[];continue;}
      data[table]=input[table].map((row,i)=>{
        if(!row||typeof row!=='object'||Array.isArray(row)){issue(table,i,'必须是对象记录');return {};}
        const normalized={};
        for(const f of fields[table]){
          const value=row[f]??'';
          if(!['string','number','boolean'].includes(typeof value)){issue(table,i,`${f}必须是文本或数值`);normalized[f]='';continue;}
          normalized[f]=String(value).trim();
          if(normalized[f].length>5000)issue(table,i,`${f}超过5000字`);
        }
        return normalized;
      });
    }
    if(data.project.length!==1)errors.push('项目表必须且只能有1条项目记录');
    if(!data.nodes.length)errors.push('节点表不能为空');
    if(data.nodes.length>200)errors.push('当前演示最多支持200个节点');
    if(data.edges.length>1000)errors.push('当前演示最多支持1000条关系');
    if(data.project[0]?.schema_version!=='1.0')errors.push('schema_version必须为1.0');
    const maps={};
    for(const [table,idKey]of Object.entries(keys)){
      maps[table]=new Map();
      data[table].forEach((row,i)=>{
        const id=row[idKey];
        if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id||''))issue(table,i,`${idKey}必填，使用字母、数字、点、短横线或下划线`);
        if(maps[table].has(id))issue(table,i,`重复编号 ${id}`);
        maps[table].set(id,row);
        if(table!=='edges'&&table!=='standards'&&!row.title)issue(table,i,'title不能为空');
      });
    }
    data.project.forEach((p,i)=>{if(!p.version)issue('project',i,'version不能为空');});
    data.project.forEach((p,i)=>{if(!status.includes(p.content_status))issue('project',i,'content_status不是支持的内容状态');});
    const sourceMap=maps.sources,nodeMap=maps.nodes;
    for(const table of Object.keys(fields).filter(x=>x!=='sources'))data[table].forEach((row,i)=>{if(!sourceMap.has(row.source_id))issue(table,i,`来源不存在：${row.source_id||'未填写'}`);});
    data.sources.forEach((s,i)=>{if(!status.includes(s.source_type))issue('sources',i,'source_type须为公开资料/设计示例/演示数据/待补充');if(s.url&&!isURL(s.url))issue('sources',i,'来源链接只接受有效的http或https地址');});
    const courses=data.nodes.filter(n=>n.node_type==='course');
    if(courses.length!==1)errors.push('节点表必须且只能有1个course根节点');
    data.nodes.forEach((n,i)=>{
      n.layer=Number(n.layer);n.sort_order=Number(n.sort_order);
      if(!(n.node_type in types)||types[n.node_type]!==n.layer)issue('nodes',i,'类型与层级不匹配：course=1, capability=2, task=3, knowledge/model/ai=4, resource=5');
      if(!Number.isInteger(n.sort_order)||n.sort_order<1)issue('nodes',i,'sort_order应为正整数');
      if(!n.short_title)issue('nodes',i,'short_title不能为空');
      if(!status.includes(n.content_status))issue('nodes',i,'content_status不是支持的内容状态');
    });
    const allowed={ 'course:capability':'培养','capability:task':'通过任务训练','task:knowledge':'依托知识','task:model':'调用模型','knowledge:resource':'依据资源','model:resource':'读取资源','task:ai':'应用AI功能','ai:resource':'依据资源'};
    const tuples=new Set();
    data.edges.forEach((e,i)=>{
      const a=nodeMap.get(e.from_id),b=nodeMap.get(e.to_id),key=`${e.from_id}|${e.to_id}|${e.relation}`;
      if(!a||!b){issue('edges',i,`关系端点不存在：${!a?e.from_id:e.to_id}`);return;}
      if(allowed[`${a.node_type}:${b.node_type}`]!==e.relation)issue('edges',i,`关系类型与两端节点不匹配：${e.from_id} → ${e.to_id}`);
      if(a.layer>=b.layer)issue('edges',i,'关系必须从上层指向下层，不允许自连或循环');
      if(tuples.has(key))issue('edges',i,'重复的节点关系');tuples.add(key);
    });
    const taskSet=new Set(data.nodes.filter(n=>n.node_type==='task').map(n=>n.node_id));
    data.evidence.forEach((e,i)=>{
      if(!e.source_fields||!e.mapping_rule||!e.missing_behavior)issue('evidence',i,'source_fields、mapping_rule、missing_behavior不能为空');
      const tasks=split(e.task_ids);if(!tasks.length)issue('evidence',i,'至少关联一个任务');
      tasks.forEach(t=>{if(!taskSet.has(t))issue('evidence',i,`任务不存在：${t}`);});
    });
    const stdKeys=new Set();
    data.standards.forEach((s,i)=>{
      if(nodeMap.get(s.capability_id)?.node_type!=='capability')issue('standards',i,`能力节点不存在：${s.capability_id}`);
      if(!['L1','L2','L3'].includes(s.level))issue('standards',i,'level必须为L1/L2/L3');
      if(!s.goal||!s.criteria||!s.mandatory_conditions)issue('standards',i,'目标、达成条件、关键条件不能为空');
      const k=`${s.capability_id}|${s.level}`;if(stdKeys.has(k))issue('standards',i,'同一能力与等级不能重复');stdKeys.add(k);
      const ts=split(s.task_ids),es=split(s.evidence_ids);
      if(!ts.length||!es.length)issue('standards',i,'任务和证据至少各关联一条');
      ts.forEach(t=>{if(!taskSet.has(t))issue('standards',i,`任务不存在：${t}`);else if(!tuples.has(`${s.capability_id}|${t}|通过任务训练`))issue('standards',i,`图谱中缺少能力到任务的关系：${t}`);});
      es.forEach(id=>{const ev=maps.evidence.get(id);if(!ev)issue('standards',i,`证据不存在：${id}`);else if(!split(ev.task_ids).some(t=>ts.includes(t)))issue('standards',i,`证据${id}未覆盖本标准的任何任务`);});
    });
    data.nodes.filter(n=>n.node_type==='capability').forEach(n=>{for(const level of ['L1','L2','L3'])if(!stdKeys.has(`${n.node_id}|${level}`))warnings.push(`${n.title}尚未配置${level}标准`);});
    if(courses.length===1){const seen=new Set([courses[0].node_id]);for(let i=0;i<5;i++)data.edges.forEach(e=>{if(seen.has(e.from_id))seen.add(e.to_id);});data.nodes.filter(n=>!seen.has(n.node_id)).forEach(n=>errors.push(`节点${n.node_id}没有连接到课程根节点`));}
    const pending=data.nodes.filter(n=>n.content_status==='待补充');if(pending.length)warnings.push(`${pending.length}个节点标记为待补充，图谱可展示，但不能作为已接入或已验证的证据。`);
    const samples=data.nodes.filter(n=>n.content_status==='演示数据');if(samples.length)warnings.push(`${samples.length}个节点使用演示数据，需与真实资源区分。`);
    warnings.push('本包不含学生成绩。能力标准定义不代表能力达成；所有映射字段为内部建议。');
    return {valid:errors.length===0,errors,warnings,data:errors.length?null:data};
  }
  function fromRows(tables){
    const data={};for(const key of Object.keys(fields)){
      const rows=tables[key]||tables[sheetNames[key]];
      if(!rows){data[key]=null;continue;}
      if(!rows.length){data[key]=[];continue;}
      const headers=rows[0].map(x=>String(x??'').replace(/^\ufeff/,'').trim());
      const missing=fields[key].filter(f=>!headers.includes(f));if(missing.length)throw new Error(`${sheetNames[key]}缺少列：${missing.join('、')}`);
      if(new Set(headers).size!==headers.length)throw new Error(`${sheetNames[key]}表头重复`);
      data[key]=rows.slice(1).filter(row=>row.some(v=>String(v??'').trim()!=='')).map(row=>Object.fromEntries(fields[key].map(f=>[f,row[headers.indexOf(f)]??''])));
    }return data;
  }
  function fromFlat(rows){
    if(!rows.length)throw new Error('CSV为空');
    const header=rows[0].map(x=>String(x??'').replace(/^\ufeff/,'').trim()),typeIndex=header.indexOf('record_type');
    if(typeIndex<0)throw new Error('单表CSV必须包含record_type列，请下载模板');
    if(new Set(header).size!==header.length)throw new Error('CSV表头重复');
    const missing=[...new Set(Object.values(fields).flat())].filter(f=>!header.includes(f));if(missing.length)throw new Error('CSV缺少列：'+missing.join('、'));
    const data=Object.fromEntries(Object.keys(fields).map(k=>[k,[]]));
    rows.slice(1).forEach((row,i)=>{if(!row.some(x=>String(x??'').trim()))return;const type=String(row[typeIndex]??'').trim();if(!fields[type])throw new Error(`CSV第${i+2}行record_type无效：${type}`);data[type].push(Object.fromEntries(fields[type].map(f=>[f,row[header.indexOf(f)]??''])));});return data;
  }
  function trace(data,id){
    const ancestors=new Set([id]),descendants=new Set([id]);
    for(let i=0;i<5;i++)data.edges.forEach(e=>{if(ancestors.has(e.to_id))ancestors.add(e.from_id);if(descendants.has(e.from_id))descendants.add(e.to_id);});
    const nodes=new Set([...ancestors,...descendants]);
    const edges=new Set(data.edges.filter(e=>(ancestors.has(e.from_id)&&ancestors.has(e.to_id))||(descendants.has(e.from_id)&&descendants.has(e.to_id))).map(e=>e.edge_id));
    return {nodes,edges};
  }
  function flatCSV(data){const headers=['record_type',...new Set(Object.values(fields).flat())];const quote=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^([=+@-])/,'\'$1')+'"';return '\ufeff'+[headers,...Object.entries(data).flatMap(([type,rows])=>rows.map(row=>headers.map(k=>k==='record_type'?type:row[k]??'')))].map(row=>row.map(quote).join(',')).join('\r\n');}
  const api={fields,keys,sheetNames,types,status,split,isURL,validate,fromRows,fromFlat,trace,flatCSV};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GraphCore=api;
})(typeof window!=='undefined'?window:globalThis);
