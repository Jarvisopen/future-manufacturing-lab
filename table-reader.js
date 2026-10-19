/* Plain-text configuration reader: CSV and standard OOXML XLSX, no formulas. */
(function(root){
 'use strict';
 function csv(text){
  text=text.replace(/^\ufeff/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
   if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
   if(ch==='"'){if(cell||closed)throw new Error('CSV引号格式错误');quoted=true;continue;}
   if(ch===','){row.push(cell);cell='';closed=false;continue;}
   if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;continue;}
   if(closed)throw new Error('CSV引号后只能跟逗号或换行');cell+=ch;
  }
  if(quoted)throw new Error('CSV存在未闭合的引号');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
 }
 const elements=(el,name)=>Array.from(el.getElementsByTagNameNS('*',name));
 function xml(text,name){if(text.length>4*1024*1024)throw new Error(name+'解压后超过4MB');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error(name+'不是有效XML');return doc;}
 async function xlsx(buffer){
  if(!root.JSZip)throw new Error('表格读取组件未加载，请刷新或使用JSON导入');
  const zip=await root.JSZip.loadAsync(buffer);
  async function read(path,optional=false){const file=zip.file(path);if(!file){if(optional)return null;throw new Error('Excel缺少'+path);}return xml(await file.async('string'),path);}
  const workbook=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels'),strings=await read('xl/sharedStrings.xml',true);
  const shared=strings?elements(strings,'si').map(si=>elements(si,'t').map(t=>t.textContent).join('')):[];
  const paths=new Map(elements(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>{const target=r.getAttribute('Target');const path=new URL(target.startsWith('/')?target:'/xl/'+target,'https://xlsx.local').pathname.slice(1);return[r.getAttribute('Id'),path];}));
  const tables={};
  for(const sheet of elements(workbook,'sheet')){
   const name=sheet.getAttribute('name');if(!Object.values(root.GraphCore.sheetNames).includes(name)&&!Object.keys(root.GraphCore.sheetNames).includes(name))continue;
   const id=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const path=paths.get(id);if(!path)throw new Error('工作表关系不存在：'+name);
   const doc=await read(path),rows=[];
   for(const cell of elements(doc,'c')){
    const address=cell.getAttribute('r')||'',match=/^([A-Z]+)(\d+)$/.exec(address);if(!match)throw new Error(name+'中存在无效单元格地址');const ri=Number(match[2])-1,ci=match[1].split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
    if(ri>2000||ci>63)throw new Error(name+'超出2001行或64列的导入范围');
    if(elements(cell,'f').length)throw new Error(name+'!'+address+'含公式，请粘贴为纯文本后导入');
    const type=cell.getAttribute('t'),value=elements(cell,'v')[0]?.textContent??'';
    if(type==='e')throw new Error(name+'!'+address+'含Excel错误值');
    const content=type==='s'?(shared[Number(value)]??''):type==='inlineStr'?elements(cell,'t').map(t=>t.textContent).join(''):value;
    if(!rows[ri])rows[ri]=[];rows[ri][ci]=content;
   }
   const width=Math.max(0,...rows.filter(Boolean).map(r=>r.length));tables[name]=Array.from({length:rows.length},(_,ri)=>Array.from({length:width},(_,ci)=>rows[ri]?.[ci]??''));
  }
  return root.GraphCore.fromRows(tables);
 }
 root.TableReader={csv,xlsx};
})(typeof window!=='undefined'?window:globalThis);
