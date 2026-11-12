import * as THREE from './three.module.js';
const definitions=[{name:'AND',status:'Dominado',color:0x20a56b,position:[-1.45,1.3,.45],size:.72},{name:'OR',status:'Em aprendizagem',color:0x438fee,position:[1.45,1.05,-.55],size:.62},{name:'NOT',status:'Revisão pendente',color:0xeead35,position:[-.95,-1.3,.8],size:.75},{name:'Implicação',status:'Ainda não praticado',color:0x8c97a6,position:[1.55,-1.4,-.65],size:.6}];
let finished=0;
for(const kind of ['matte','polished','faceted']){
 const host=document.getElementById(kind),scene=new THREE.Scene();
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x11151c,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.z=8.8;
 scene.add(new THREE.HemisphereLight(0xffffff,0x1d2330,1.8));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,6);scene.add(light);const rim=new THREE.DirectionalLight(0xc4d7ff,1);rim.position.set(4,0,2);scene.add(rim);
 const group=new THREE.Group();group.rotation.y=-.12;scene.add(group);
 const labels=[];const meshes=[];
 for(const d of definitions){
  const geometry=kind==='faceted'?new THREE.IcosahedronGeometry(d.size,0):new THREE.SphereGeometry(d.size,64,48);
  const material=kind==='polished'?new THREE.MeshPhysicalMaterial({color:d.color,roughness:.12,metalness:.15,clearcoat:1,clearcoatRoughness:.08}):new THREE.MeshStandardMaterial({color:d.color,roughness:kind==='matte'?.92:.4,metalness:kind==='matte'?0:.16,flatShading:kind==='faceted'});
  const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(d.position);group.add(mesh);meshes.push(mesh);
  const label=document.createElement('div');label.className='label';const title=document.createElement('span');title.textContent=d.name;const small=document.createElement('small');small.textContent=d.status;label.append(title,small);host.appendChild(label);labels.push(label);
 }
 for(const [a,b]of[[0,1],[0,2],[1,2],[1,3],[2,3]]){const start=meshes[a].position,end=meshes[b].position,delta=new THREE.Vector3().subVectors(end,start);const edge=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,delta.length(),8),new THREE.MeshBasicMaterial({color:0x4a5363,transparent:true,opacity:.7}));edge.position.copy(start).add(end).multiplyScalar(.5);edge.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(edge);}
 function render(){renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();group.updateMatrixWorld(true);renderer.render(scene,camera);meshes.forEach((mesh,i)=>{const v=mesh.position.clone();v.y-=definitions[i].size+.12;group.localToWorld(v);v.project(camera);labels[i].style.left=(v.x*.5+.5)*100+'%';labels[i].style.top=(-v.y*.5+.5)*100+'%';});}
 let drag=null;host.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId)});host.addEventListener('pointermove',e=>{if(!drag)return;group.rotation.y+=(e.clientX-drag.x)*.009;group.rotation.x+=(e.clientY-drag.y)*.006;drag={x:e.clientX,y:e.clientY};render()});host.addEventListener('pointerup',()=>drag=null);host.addEventListener('pointercancel',()=>drag=null);host.addEventListener('wheel',e=>{e.preventDefault();camera.position.z=THREE.MathUtils.clamp(camera.position.z+e.deltaY*.007,7,14);render()},{passive:false});new ResizeObserver(render).observe(host);render();finished++;
}
document.documentElement.dataset.modelsReady=String(finished);
