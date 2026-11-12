var FluxosVendor=(()=>{var $=Object.defineProperty;var Tt=Object.getOwnPropertyDescriptor;var Rt=Object.getOwnPropertyNames;var qt=Object.prototype.hasOwnProperty;var Ut=(e,t)=>{for(var r in t)$(e,r,{get:t[r],enumerable:!0})},Ht=(e,t,r,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of Rt(t))!qt.call(e,o)&&o!==r&&$(e,o,{get:()=>t[o],enumerable:!(a=Tt(t,o))||a.enumerable});return e};var Ot=e=>Ht($({},"__esModule",{value:!0}),e);var tr={};Ut(tr,{forceCollide:()=>te,forceLink:()=>re,forceManyBody:()=>ue,forceSimulation:()=>se,forceX:()=>de,forceY:()=>pe,mountIcons:()=>er});function tt(e){let t=+this._x.call(null,e),r=+this._y.call(null,e);return rt(this.cover(t,r),t,r,e)}function rt(e,t,r,a){if(isNaN(t)||isNaN(r))return e;var o,f=e._root,p={data:a},l=e._x0,x=e._y0,d=e._x1,c=e._y1,w,h,i,S,m,u,n,g;if(!f)return e._root=p,e;for(;f.length;)if((m=t>=(w=(l+d)/2))?l=w:d=w,(u=r>=(h=(x+c)/2))?x=h:c=h,o=f,!(f=f[n=u<<1|m]))return o[n]=p,e;if(i=+e._x.call(null,f.data),S=+e._y.call(null,f.data),t===i&&r===S)return p.next=f,o?o[n]=p:e._root=p,e;do o=o?o[n]=new Array(4):e._root=new Array(4),(m=t>=(w=(l+d)/2))?l=w:d=w,(u=r>=(h=(x+c)/2))?x=h:c=h;while((n=u<<1|m)===(g=(S>=h)<<1|i>=w));return o[g]=f,o[n]=p,e}function at(e){var t,r,a=e.length,o,f,p=new Array(a),l=new Array(a),x=1/0,d=1/0,c=-1/0,w=-1/0;for(r=0;r<a;++r)isNaN(o=+this._x.call(null,t=e[r]))||isNaN(f=+this._y.call(null,t))||(p[r]=o,l[r]=f,o<x&&(x=o),o>c&&(c=o),f<d&&(d=f),f>w&&(w=f));if(x>c||d>w)return this;for(this.cover(x,d).cover(c,w),r=0;r<a;++r)rt(this,p[r],l[r],e[r]);return this}function ot(e,t){if(isNaN(e=+e)||isNaN(t=+t))return this;var r=this._x0,a=this._y0,o=this._x1,f=this._y1;if(isNaN(r))o=(r=Math.floor(e))+1,f=(a=Math.floor(t))+1;else{for(var p=o-r||1,l=this._root,x,d;r>e||e>=o||a>t||t>=f;)switch(d=(t<a)<<1|e<r,x=new Array(4),x[d]=l,l=x,p*=2,d){case 0:o=r+p,f=a+p;break;case 1:r=o-p,f=a+p;break;case 2:o=r+p,a=f-p;break;case 3:r=o-p,a=f-p;break}this._root&&this._root.length&&(this._root=l)}return this._x0=r,this._y0=a,this._x1=o,this._y1=f,this}function ft(){var e=[];return this.visit(function(t){if(!t.length)do e.push(t.data);while(t=t.next)}),e}function lt(e){return arguments.length?this.cover(+e[0][0],+e[0][1]).cover(+e[1][0],+e[1][1]):isNaN(this._x0)?void 0:[[this._x0,this._y0],[this._x1,this._y1]]}function k(e,t,r,a,o){this.node=e,this.x0=t,this.y0=r,this.x1=a,this.y1=o}function st(e,t,r){var a,o=this._x0,f=this._y0,p,l,x,d,c=this._x1,w=this._y1,h=[],i=this._root,S,m;for(i&&h.push(new k(i,o,f,c,w)),r==null?r=1/0:(o=e-r,f=t-r,c=e+r,w=t+r,r*=r);S=h.pop();)if(!(!(i=S.node)||(p=S.x0)>c||(l=S.y0)>w||(x=S.x1)<o||(d=S.y1)<f))if(i.length){var u=(p+x)/2,n=(l+d)/2;h.push(new k(i[3],u,n,x,d),new k(i[2],p,n,u,d),new k(i[1],u,l,x,n),new k(i[0],p,l,u,n)),(m=(t>=n)<<1|e>=u)&&(S=h[h.length-1],h[h.length-1]=h[h.length-1-m],h[h.length-1-m]=S)}else{var g=e-+this._x.call(null,i.data),y=t-+this._y.call(null,i.data),C=g*g+y*y;if(C<r){var v=Math.sqrt(r=C);o=e-v,f=t-v,c=e+v,w=t+v,a=i.data}}return a}function ut(e){if(isNaN(c=+this._x.call(null,e))||isNaN(w=+this._y.call(null,e)))return this;var t,r=this._root,a,o,f,p=this._x0,l=this._y0,x=this._x1,d=this._y1,c,w,h,i,S,m,u,n;if(!r)return this;if(r.length)for(;;){if((S=c>=(h=(p+x)/2))?p=h:x=h,(m=w>=(i=(l+d)/2))?l=i:d=i,t=r,!(r=r[u=m<<1|S]))return this;if(!r.length)break;(t[u+1&3]||t[u+2&3]||t[u+3&3])&&(a=t,n=u)}for(;r.data!==e;)if(o=r,!(r=r.next))return this;return(f=r.next)&&delete r.next,o?(f?o.next=f:delete o.next,this):t?(f?t[u]=f:delete t[u],(r=t[0]||t[1]||t[2]||t[3])&&r===(t[3]||t[2]||t[1]||t[0])&&!r.length&&(a?a[n]=r:this._root=r),this):(this._root=f,this)}function dt(e){for(var t=0,r=e.length;t<r;++t)this.remove(e[t]);return this}function pt(){return this._root}function mt(){var e=0;return this.visit(function(t){if(!t.length)do++e;while(t=t.next)}),e}function it(e){var t=[],r,a=this._root,o,f,p,l,x;for(a&&t.push(new k(a,this._x0,this._y0,this._x1,this._y1));r=t.pop();)if(!e(a=r.node,f=r.x0,p=r.y0,l=r.x1,x=r.y1)&&a.length){var d=(f+l)/2,c=(p+x)/2;(o=a[3])&&t.push(new k(o,d,c,l,x)),(o=a[2])&&t.push(new k(o,f,c,d,x)),(o=a[1])&&t.push(new k(o,d,p,l,c)),(o=a[0])&&t.push(new k(o,f,p,d,c))}return this}function nt(e){var t=[],r=[],a;for(this._root&&t.push(new k(this._root,this._x0,this._y0,this._x1,this._y1));a=t.pop();){var o=a.node;if(o.length){var f,p=a.x0,l=a.y0,x=a.x1,d=a.y1,c=(p+x)/2,w=(l+d)/2;(f=o[0])&&t.push(new k(f,p,l,c,w)),(f=o[1])&&t.push(new k(f,c,l,x,w)),(f=o[2])&&t.push(new k(f,p,w,c,d)),(f=o[3])&&t.push(new k(f,c,w,x,d))}r.push(a)}for(;a=r.pop();)e(a.node,a.x0,a.y0,a.x1,a.y1);return this}function xt(e){return e[0]}function ct(e){return arguments.length?(this._x=e,this):this._x}function ht(e){return e[1]}function gt(e){return arguments.length?(this._y=e,this):this._y}function U(e,t,r){var a=new ee(t??xt,r??ht,NaN,NaN,NaN,NaN);return e==null?a:a.addAll(e)}function ee(e,t,r,a,o,f){this._x=e,this._y=t,this._x0=r,this._y0=a,this._x1=o,this._y1=f,this._root=void 0}function Ct(e){for(var t={data:e.data},r=t;e=e.next;)r=r.next={data:e.data};return t}var F=U.prototype=ee.prototype;F.copy=function(){var e=new ee(this._x,this._y,this._x0,this._y0,this._x1,this._y1),t=this._root,r,a;if(!t)return e;if(!t.length)return e._root=Ct(t),e;for(r=[{source:t,target:e._root=new Array(4)}];t=r.pop();)for(var o=0;o<4;++o)(a=t.source[o])&&(a.length?r.push({source:a,target:t.target[o]=new Array(4)}):t.target[o]=Ct(a));return e};F.add=tt;F.addAll=at;F.cover=ot;F.data=ft;F.extent=lt;F.find=st;F.remove=ut;F.removeAll=dt;F.root=pt;F.size=mt;F.visit=it;F.visitAfter=nt;F.x=ct;F.y=gt;function A(e){return function(){return e}}function L(e){return(e()-.5)*1e-6}function _t(e){return e.x+e.vx}function Nt(e){return e.y+e.vy}function te(e){var t,r,a,o=1,f=1;typeof e!="function"&&(e=A(e==null?1:+e));function p(){for(var d,c=t.length,w,h,i,S,m,u,n=0;n<f;++n)for(w=U(t,_t,Nt).visitAfter(l),d=0;d<c;++d)h=t[d],m=r[h.index],u=m*m,i=h.x+h.vx,S=h.y+h.vy,w.visit(g);function g(y,C,v,B,D){var M=y.data,b=y.r,P=m+b;if(M){if(M.index>h.index){var R=i-M.x-M.vx,q=S-M.y-M.vy,T=R*R+q*q;T<P*P&&(R===0&&(R=L(a),T+=R*R),q===0&&(q=L(a),T+=q*q),T=(P-(T=Math.sqrt(T)))/T*o,h.vx+=(R*=T)*(P=(b*=b)/(u+b)),h.vy+=(q*=T)*P,M.vx-=R*(P=1-P),M.vy-=q*P)}return}return C>i+P||B<i-P||v>S+P||D<S-P}}function l(d){if(d.data)return d.r=r[d.data.index];for(var c=d.r=0;c<4;++c)d[c]&&d[c].r>d.r&&(d.r=d[c].r)}function x(){if(t){var d,c=t.length,w;for(r=new Array(c),d=0;d<c;++d)w=t[d],r[w.index]=+e(w,d,t)}}return p.initialize=function(d,c){t=d,a=c,x()},p.iterations=function(d){return arguments.length?(f=+d,p):f},p.strength=function(d){return arguments.length?(o=+d,p):o},p.radius=function(d){return arguments.length?(e=typeof d=="function"?d:A(+d),x(),p):e},p}function Et(e){return e.index}function St(e,t){var r=e.get(t);if(!r)throw new Error("node not found: "+t);return r}function re(e){var t=Et,r=w,a,o=A(30),f,p,l,x,d,c=1;e==null&&(e=[]);function w(u){return 1/Math.min(l[u.source.index],l[u.target.index])}function h(u){for(var n=0,g=e.length;n<c;++n)for(var y=0,C,v,B,D,M,b,P;y<g;++y)C=e[y],v=C.source,B=C.target,D=B.x+B.vx-v.x-v.vx||L(d),M=B.y+B.vy-v.y-v.vy||L(d),b=Math.sqrt(D*D+M*M),b=(b-f[y])/b*u*a[y],D*=b,M*=b,B.vx-=D*(P=x[y]),B.vy-=M*P,v.vx+=D*(P=1-P),v.vy+=M*P}function i(){if(p){var u,n=p.length,g=e.length,y=new Map(p.map((v,B)=>[t(v,B,p),v])),C;for(u=0,l=new Array(n);u<g;++u)C=e[u],C.index=u,typeof C.source!="object"&&(C.source=St(y,C.source)),typeof C.target!="object"&&(C.target=St(y,C.target)),l[C.source.index]=(l[C.source.index]||0)+1,l[C.target.index]=(l[C.target.index]||0)+1;for(u=0,x=new Array(g);u<g;++u)C=e[u],x[u]=l[C.source.index]/(l[C.source.index]+l[C.target.index]);a=new Array(g),S(),f=new Array(g),m()}}function S(){if(p)for(var u=0,n=e.length;u<n;++u)a[u]=+r(e[u],u,e)}function m(){if(p)for(var u=0,n=e.length;u<n;++u)f[u]=+o(e[u],u,e)}return h.initialize=function(u,n){p=u,d=n,i()},h.links=function(u){return arguments.length?(e=u,i(),h):e},h.id=function(u){return arguments.length?(t=u,h):t},h.iterations=function(u){return arguments.length?(c=+u,h):c},h.strength=function(u){return arguments.length?(r=typeof u=="function"?u:A(+u),S(),h):r},h.distance=function(u){return arguments.length?(o=typeof u=="function"?u:A(+u),m(),h):o},h}var It={value:()=>{}};function yt(){for(var e=0,t=arguments.length,r={},a;e<t;++e){if(!(a=arguments[e]+"")||a in r||/[\s.]/.test(a))throw new Error("illegal type: "+a);r[a]=[]}return new V(r)}function V(e){this._=e}function zt(e,t){return e.trim().split(/^|\s+/).map(function(r){var a="",o=r.indexOf(".");if(o>=0&&(a=r.slice(o+1),r=r.slice(0,o)),r&&!t.hasOwnProperty(r))throw new Error("unknown type: "+r);return{type:r,name:a}})}V.prototype=yt.prototype={constructor:V,on:function(e,t){var r=this._,a=zt(e+"",r),o,f=-1,p=a.length;if(arguments.length<2){for(;++f<p;)if((o=(e=a[f]).type)&&(o=Vt(r[o],e.name)))return o;return}if(t!=null&&typeof t!="function")throw new Error("invalid callback: "+t);for(;++f<p;)if(o=(e=a[f]).type)r[o]=wt(r[o],e.name,t);else if(t==null)for(o in r)r[o]=wt(r[o],e.name,null);return this},copy:function(){var e={},t=this._;for(var r in t)e[r]=t[r].slice();return new V(e)},call:function(e,t){if((o=arguments.length-2)>0)for(var r=new Array(o),a=0,o,f;a<o;++a)r[a]=arguments[a+2];if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(f=this._[e],a=0,o=f.length;a<o;++a)f[a].value.apply(t,r)},apply:function(e,t,r){if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(var a=this._[e],o=0,f=a.length;o<f;++o)a[o].value.apply(t,r)}};function Vt(e,t){for(var r=0,a=e.length,o;r<a;++r)if((o=e[r]).name===t)return o.value}function wt(e,t,r){for(var a=0,o=e.length;a<o;++a)if(e[a].name===t){e[a]=It,e=e.slice(0,a).concat(e.slice(a+1));break}return r!=null&&e.push({name:t,value:r}),e}var ae=yt;var O=0,E=0,N=0,At=1e3,G,I,W=0,H=0,X=0,z=typeof performance=="object"&&performance.now?performance:Date,Mt=typeof window=="object"&&window.requestAnimationFrame?window.requestAnimationFrame.bind(window):function(e){setTimeout(e,17)};function le(){return H||(Mt(Gt),H=z.now()+X)}function Gt(){H=0}function oe(){this._call=this._time=this._next=null}oe.prototype=K.prototype={constructor:oe,restart:function(e,t,r){if(typeof e!="function")throw new TypeError("callback is not a function");r=(r==null?le():+r)+(t==null?0:+t),!this._next&&I!==this&&(I?I._next=this:G=this,I=this),this._call=e,this._time=r,fe()},stop:function(){this._call&&(this._call=null,this._time=1/0,fe())}};function K(e,t,r){var a=new oe;return a.restart(e,t,r),a}function Pt(){le(),++O;for(var e=G,t;e;)(t=H-e._time)>=0&&e._call.call(void 0,t),e=e._next;--O}function vt(){H=(W=z.now())+X,O=E=0;try{Pt()}finally{O=0,Xt(),H=0}}function Wt(){var e=z.now(),t=e-W;t>At&&(X-=t,W=e)}function Xt(){for(var e,t=G,r,a=1/0;t;)t._call?(a>t._time&&(a=t._time),e=t,t=t._next):(r=t._next,t._next=null,t=e?e._next=r:G=r);I=e,fe(a)}function fe(e){if(!O){E&&(E=clearTimeout(E));var t=e-H;t>24?(e<1/0&&(E=setTimeout(vt,e-z.now()-X)),N&&(N=clearInterval(N))):(N||(W=z.now(),N=setInterval(Wt,At)),O=1,Mt(vt))}}function kt(){let e=1;return()=>(e=(1664525*e+1013904223)%4294967296)/4294967296}function Bt(e){return e.x}function Ft(e){return e.y}var Kt=10,Zt=Math.PI*(3-Math.sqrt(5));function se(e){var t,r=1,a=.001,o=1-Math.pow(a,1/300),f=0,p=.6,l=new Map,x=K(w),d=ae("tick","end"),c=kt();e==null&&(e=[]);function w(){h(),d.call("tick",t),r<a&&(x.stop(),d.call("end",t))}function h(m){var u,n=e.length,g;m===void 0&&(m=1);for(var y=0;y<m;++y)for(r+=(f-r)*o,l.forEach(function(C){C(r)}),u=0;u<n;++u)g=e[u],g.fx==null?g.x+=g.vx*=p:(g.x=g.fx,g.vx=0),g.fy==null?g.y+=g.vy*=p:(g.y=g.fy,g.vy=0);return t}function i(){for(var m=0,u=e.length,n;m<u;++m){if(n=e[m],n.index=m,n.fx!=null&&(n.x=n.fx),n.fy!=null&&(n.y=n.fy),isNaN(n.x)||isNaN(n.y)){var g=Kt*Math.sqrt(.5+m),y=m*Zt;n.x=g*Math.cos(y),n.y=g*Math.sin(y)}(isNaN(n.vx)||isNaN(n.vy))&&(n.vx=n.vy=0)}}function S(m){return m.initialize&&m.initialize(e,c),m}return i(),t={tick:h,restart:function(){return x.restart(w),t},stop:function(){return x.stop(),t},nodes:function(m){return arguments.length?(e=m,i(),l.forEach(S),t):e},alpha:function(m){return arguments.length?(r=+m,t):r},alphaMin:function(m){return arguments.length?(a=+m,t):a},alphaDecay:function(m){return arguments.length?(o=+m,t):+o},alphaTarget:function(m){return arguments.length?(f=+m,t):f},velocityDecay:function(m){return arguments.length?(p=1-m,t):1-p},randomSource:function(m){return arguments.length?(c=m,l.forEach(S),t):c},force:function(m,u){return arguments.length>1?(u==null?l.delete(m):l.set(m,S(u)),t):l.get(m)},find:function(m,u,n){var g=0,y=e.length,C,v,B,D,M;for(n==null?n=1/0:n*=n,g=0;g<y;++g)D=e[g],C=m-D.x,v=u-D.y,B=C*C+v*v,B<n&&(M=D,n=B);return M},on:function(m,u){return arguments.length>1?(d.on(m,u),t):d.on(m)}}}function ue(){var e,t,r,a,o=A(-30),f,p=1,l=1/0,x=.81;function d(i){var S,m=e.length,u=U(e,Bt,Ft).visitAfter(w);for(a=i,S=0;S<m;++S)t=e[S],u.visit(h)}function c(){if(e){var i,S=e.length,m;for(f=new Array(S),i=0;i<S;++i)m=e[i],f[m.index]=+o(m,i,e)}}function w(i){var S=0,m,u,n=0,g,y,C;if(i.length){for(g=y=C=0;C<4;++C)(m=i[C])&&(u=Math.abs(m.value))&&(S+=m.value,n+=u,g+=u*m.x,y+=u*m.y);i.x=g/n,i.y=y/n}else{m=i,m.x=m.data.x,m.y=m.data.y;do S+=f[m.data.index];while(m=m.next)}i.value=S}function h(i,S,m,u){if(!i.value)return!0;var n=i.x-t.x,g=i.y-t.y,y=u-S,C=n*n+g*g;if(y*y/x<C)return C<l&&(n===0&&(n=L(r),C+=n*n),g===0&&(g=L(r),C+=g*g),C<p&&(C=Math.sqrt(p*C)),t.vx+=n*i.value*a/C,t.vy+=g*i.value*a/C),!0;if(i.length||C>=l)return;(i.data!==t||i.next)&&(n===0&&(n=L(r),C+=n*n),g===0&&(g=L(r),C+=g*g),C<p&&(C=Math.sqrt(p*C)));do i.data!==t&&(y=f[i.data.index]*a/C,t.vx+=n*y,t.vy+=g*y);while(i=i.next)}return d.initialize=function(i,S){e=i,r=S,c()},d.strength=function(i){return arguments.length?(o=typeof i=="function"?i:A(+i),c(),d):o},d.distanceMin=function(i){return arguments.length?(p=i*i,d):Math.sqrt(p)},d.distanceMax=function(i){return arguments.length?(l=i*i,d):Math.sqrt(l)},d.theta=function(i){return arguments.length?(x=i*i,d):Math.sqrt(x)},d}function de(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var x=0,d=r.length,c;x<d;++x)c=r[x],c.vx+=(o[x]-c.x)*a[x]*l}function p(){if(r){var l,x=r.length;for(a=new Array(x),o=new Array(x),l=0;l<x;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,p()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),p(),f):t},f.x=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),p(),f):e},f}function pe(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var x=0,d=r.length,c;x<d;++x)c=r[x],c.vy+=(o[x]-c.y)*a[x]*l}function p(){if(r){var l,x=r.length;for(a=new Array(x),o=new Array(x),l=0;l<x;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,p()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),p(),f):t},f.y=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),p(),f):e},f}var Dt=(e,t,r=[])=>{let a=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.keys(t).forEach(o=>{a.setAttribute(o,String(t[o]))}),r.length&&r.forEach(o=>{let f=Dt(...o);a.appendChild(f)}),a},bt=([e,t,r])=>Dt(e,t,r);var jt=e=>Array.from(e.attributes).reduce((t,r)=>(t[r.name]=r.value,t),{}),Jt=e=>typeof e=="string"?e:!e||!e.class?"":e.class&&typeof e.class=="string"?e.class.split(" "):e.class&&Array.isArray(e.class)?e.class:"",Qt=e=>e.flatMap(Jt).map(r=>r.trim()).filter(Boolean).filter((r,a,o)=>o.indexOf(r)===a).join(" "),Yt=e=>e.replace(/(\w)(\w*)(_|-|\s*)/g,(t,r,a)=>r.toUpperCase()+a.toLowerCase()),me=(e,{nameAttr:t,icons:r,attrs:a})=>{let o=e.getAttribute(t);if(o==null)return;let f=Yt(o),p=r[f];if(!p)return console.warn(`${e.outerHTML} icon name was not found in the provided icons object.`);let l=jt(e),[x,d,c]=p,w={...d,"data-lucide":o,...a,...l},h=Qt(["lucide",`lucide-${o}`,l,a]);h&&Object.assign(w,{class:h});let i=bt([x,w,c]);return e.parentNode?.replaceChild(i,e)};var s={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};var ie=["svg",s,[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"}],["path",{d:"M10 12h4"}]]];var ne=["svg",s,[["path",{d:"M12 5v14"}],["path",{d:"m19 12-7 7-7-7"}]]];var xe=["svg",s,[["path",{d:"m5 12 7-7 7 7"}],["path",{d:"M12 19V5"}]]];var ce=["svg",s,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"m4.9 4.9 14.2 14.2"}]]];var he=["svg",s,[["path",{d:"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{d:"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{d:"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{d:"M10 6h4"}],["path",{d:"M10 10h4"}],["path",{d:"M10 14h4"}],["path",{d:"M10 18h4"}]]];var ge=["svg",s,[["path",{d:"M20 6 9 17l-5-5"}]]];var Ce=["svg",s,[["path",{d:"m6 9 6 6 6-6"}]]];var Se=["svg",s,[["path",{d:"m9 18 6-6-6-6"}]]];var Z=["svg",s,[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16"}]]];var j=["svg",s,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"m9 12 2 2 4-4"}]]];var J=["svg",s,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"}],["path",{d:"M12 17h.01"}]]];var we=["svg",s,[["circle",{cx:"12",cy:"12",r:"10"}],["polyline",{points:"12 6 12 12 16.5 12"}]]];var ye=["svg",s,[["polyline",{points:"15 10 20 15 15 20"}],["path",{d:"M4 4v7a4 4 0 0 0 4 4h12"}]]];var ve=["svg",s,[["polyline",{points:"9 14 4 9 9 4"}],["path",{d:"M20 20v-7a4 4 0 0 0-4-4H4"}]]];var Ae=["svg",s,[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"7 10 12 15 17 10"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3"}]]];var _=["svg",s,[["circle",{cx:"12",cy:"12",r:"1"}],["circle",{cx:"19",cy:"12",r:"1"}],["circle",{cx:"5",cy:"12",r:"1"}]]];var Me=["svg",s,[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{d:"M10 9H8"}],["path",{d:"M16 13H8"}],["path",{d:"M16 17H8"}]]];var Pe=["svg",s,[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15"}]]];var ke=["svg",s,[["path",{d:"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"}],["path",{d:"M8 10v4"}],["path",{d:"M12 10v2"}],["path",{d:"M16 10v6"}]]];var Be=["svg",s,[["path",{d:"m16.02 12 5.48 3.13a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74L7.98 12"}],["path",{d:"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74Z"}]]];var Fe=["svg",s,[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12"}]]];var De=["svg",s,[["path",{d:"m3 10 2.5-2.5L3 5"}],["path",{d:"m3 19 2.5-2.5L3 14"}],["path",{d:"M10 6h11"}],["path",{d:"M10 12h11"}],["path",{d:"M10 18h11"}]]];var be=["svg",s,[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]]];var Le=["svg",s,[["path",{d:"M21 12h-8"}],["path",{d:"M21 6H8"}],["path",{d:"M21 18h-8"}],["path",{d:"M3 6v4c0 1.1.9 2 2 2h3"}],["path",{d:"M3 10v6c0 1.1.9 2 2 2h3"}]]];var Q=["svg",s,[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56"}]]];var Te=["svg",s,[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}],["polyline",{points:"16 17 21 12 16 7"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12"}]]];var Re=["svg",s,[["polyline",{points:"15 3 21 3 21 9"}],["polyline",{points:"9 21 3 21 3 15"}],["line",{x1:"21",x2:"14",y1:"3",y2:"10"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14"}]]];var qe=["svg",s,[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]]];var Ue=["svg",s,[["polyline",{points:"4 14 10 14 10 20"}],["polyline",{points:"20 10 14 10 14 4"}],["line",{x1:"14",x2:"21",y1:"10",y2:"3"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14"}]]];var He=["svg",s,[["rect",{x:"16",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"2",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"9",y:"2",width:"6",height:"6",rx:"1"}],["path",{d:"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"}],["path",{d:"M12 12V8"}]]];var Oe=["svg",s,[["path",{d:"m16 16 2 2 4-4"}],["path",{d:"M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"}],["path",{d:"m7.5 4.27 9 5.15"}],["polyline",{points:"3.29 7 12 12 20.71 7"}],["line",{x1:"12",x2:"12",y1:"22",y2:"12"}]]];var _e=["svg",s,[["path",{d:"M13.234 20.252 21 12.3"}],["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486"}]]];var Ne=["svg",s,[["rect",{x:"14",y:"4",width:"4",height:"16",rx:"1"}],["rect",{x:"6",y:"4",width:"4",height:"16",rx:"1"}]]];var Ee=["svg",s,[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{d:"m15 5 4 4"}]]];var Ie=["svg",s,[["polygon",{points:"6 3 20 12 6 21 6 3"}]]];var ze=["svg",s,[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]]];var Ve=["svg",s,[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]]];var Ge=["svg",s,[["circle",{cx:"11",cy:"11",r:"8"}],["path",{d:"m21 21-4.3-4.3"}]]];var We=["svg",s,[["path",{d:"M20 7h-9"}],["path",{d:"M14 17H5"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]]];var Xe=["svg",s,[["line",{x1:"21",x2:"14",y1:"4",y2:"4"}],["line",{x1:"10",x2:"3",y1:"4",y2:"4"}],["line",{x1:"21",x2:"12",y1:"12",y2:"12"}],["line",{x1:"8",x2:"3",y1:"12",y2:"12"}],["line",{x1:"21",x2:"16",y1:"20",y2:"20"}],["line",{x1:"12",x2:"3",y1:"20",y2:"20"}],["line",{x1:"14",x2:"14",y1:"2",y2:"6"}],["line",{x1:"8",x2:"8",y1:"10",y2:"14"}],["line",{x1:"16",x2:"16",y1:"18",y2:"22"}]]];var Y=["svg",s,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"m9 12 2 2 4-4"}]]];var Ke=["svg",s,[["path",{d:"M5 22h14"}],["path",{d:"M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"}],["path",{d:"M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-3-3c-1.66 0-3 1-3 3s1 2 1 3.5V13"}]]];var Ze=["svg",s,[["path",{d:"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"}]]];var je=["svg",s,[["path",{d:"M3 6h18"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17"}]]];var Je=["svg",s,[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{cx:"9",cy:"7",r:"4"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75"}]]];var Qe=["svg",s,[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2"}]]];var Ye=["svg",s,[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]]];var $e=["svg",s,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var et=["svg",s,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var Lt=({icons:e={},nameAttr:t="data-lucide",attrs:r={}}={})=>{if(!Object.values(e).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof document>"u")throw new Error("`createIcons()` only works in a browser environment.");let a=document.querySelectorAll(`[${t}]`);if(Array.from(a).forEach(o=>me(o,{nameAttr:t,icons:e,attrs:r})),t==="data-lucide"){let o=document.querySelectorAll("[icon-name]");o.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(o).forEach(f=>me(f,{nameAttr:"icon-name",icons:e,attrs:r})))}};var $t={Network:He,Workflow:Qe,Table2:Ze,Plus:ze,X:Ye,ChevronDown:Ce,ChevronRight:Se,Search:Ge,SlidersHorizontal:Xe,Settings2:We,LogOut:Te,Download:Ae,RotateCcw:Ve,Maximize:qe,ZoomIn:$e,ZoomOut:et,Link2:Fe,Trash2:je,Check:ge,MoreHorizontal:_,Users:Je,Building2:he,CircleHelp:J,FolderKanban:ke,Layers2:Be,ListTree:Le,SquareCheck:Y,Stamp:Ke,CircleAlert:Z,PackageCheck:Oe,Flag:Pe,FileText:Me,Pencil:Ee,ArrowUp:xe,ArrowDown:ne,CornerDownRight:ye,CornerUpLeft:ve,Paperclip:_e,Play:Ie,Pause:Ne,Maximize2:Re,Minimize2:Ue,Archive:ie,ListTodo:be,Ban:ce,ListCollapse:De,LoaderCircle:Q,Ellipsis:_,CheckCircle2:j,Clock3:we};function er(){Lt({icons:$t,attrs:{"stroke-width":1.7,"aria-hidden":"true"}})}return Ot(tr);})();
/*! Bundled license information:

lucide/dist/esm/createElement.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/replaceElement.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/defaultAttributes.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/archive.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/arrow-down.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/arrow-up.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/ban.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/building-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/check.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/chevron-down.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/chevron-right.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/circle-alert.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/circle-check.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/circle-help.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/clock-3.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/corner-down-right.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/corner-up-left.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/download.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/ellipsis.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/file-text.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/flag.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/folder-kanban.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/layers-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/link-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/list-collapse.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/list-todo.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/list-tree.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/log-out.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/maximize-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/maximize.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/minimize-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/network.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/package-check.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/paperclip.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/pause.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/pencil.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/play.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/plus.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/rotate-ccw.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/search.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/settings-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/sliders-horizontal.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/square-check.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/stamp.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/table-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/trash-2.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/users.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/workflow.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/x.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/zoom-in.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/icons/zoom-out.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide/dist/esm/lucide.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
