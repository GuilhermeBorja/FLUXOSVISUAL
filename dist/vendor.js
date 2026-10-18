var FluxosVendor=(()=>{var Q=Object.defineProperty;var yt=Object.getOwnPropertyDescriptor;var vt=Object.getOwnPropertyNames;var At=Object.prototype.hasOwnProperty;var Mt=(e,t)=>{for(var r in t)Q(e,r,{get:t[r],enumerable:!0})},Pt=(e,t,r,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of vt(t))!At.call(e,o)&&o!==r&&Q(e,o,{get:()=>t[o],enumerable:!(a=yt(t,o))||a.enumerable});return e};var kt=e=>Pt(Q({},"__esModule",{value:!0}),e);var Gt={};Mt(Gt,{forceCollide:()=>$,forceLink:()=>ee,forceManyBody:()=>le,forceSimulation:()=>fe,forceX:()=>se,forceY:()=>ue,mountIcons:()=>zt});function Ge(e){let t=+this._x.call(null,e),r=+this._y.call(null,e);return We(this.cover(t,r),t,r,e)}function We(e,t,r,a){if(isNaN(t)||isNaN(r))return e;var o,f=e._root,d={data:a},l=e._x0,x=e._y0,u=e._x1,c=e._y1,w,h,i,S,p,s,n,g;if(!f)return e._root=d,e;for(;f.length;)if((p=t>=(w=(l+u)/2))?l=w:u=w,(s=r>=(h=(x+c)/2))?x=h:c=h,o=f,!(f=f[n=s<<1|p]))return o[n]=d,e;if(i=+e._x.call(null,f.data),S=+e._y.call(null,f.data),t===i&&r===S)return d.next=f,o?o[n]=d:e._root=d,e;do o=o?o[n]=new Array(4):e._root=new Array(4),(p=t>=(w=(l+u)/2))?l=w:u=w,(s=r>=(h=(x+c)/2))?x=h:c=h;while((n=s<<1|p)===(g=(S>=h)<<1|i>=w));return o[g]=f,o[n]=d,e}function Xe(e){var t,r,a=e.length,o,f,d=new Array(a),l=new Array(a),x=1/0,u=1/0,c=-1/0,w=-1/0;for(r=0;r<a;++r)isNaN(o=+this._x.call(null,t=e[r]))||isNaN(f=+this._y.call(null,t))||(d[r]=o,l[r]=f,o<x&&(x=o),o>c&&(c=o),f<u&&(u=f),f>w&&(w=f));if(x>c||u>w)return this;for(this.cover(x,u).cover(c,w),r=0;r<a;++r)We(this,d[r],l[r],e[r]);return this}function Ke(e,t){if(isNaN(e=+e)||isNaN(t=+t))return this;var r=this._x0,a=this._y0,o=this._x1,f=this._y1;if(isNaN(r))o=(r=Math.floor(e))+1,f=(a=Math.floor(t))+1;else{for(var d=o-r||1,l=this._root,x,u;r>e||e>=o||a>t||t>=f;)switch(u=(t<a)<<1|e<r,x=new Array(4),x[u]=l,l=x,d*=2,u){case 0:o=r+d,f=a+d;break;case 1:r=o-d,f=a+d;break;case 2:o=r+d,a=f-d;break;case 3:r=o-d,a=f-d;break}this._root&&this._root.length&&(this._root=l)}return this._x0=r,this._y0=a,this._x1=o,this._y1=f,this}function Ze(){var e=[];return this.visit(function(t){if(!t.length)do e.push(t.data);while(t=t.next)}),e}function je(e){return arguments.length?this.cover(+e[0][0],+e[0][1]).cover(+e[1][0],+e[1][1]):isNaN(this._x0)?void 0:[[this._x0,this._y0],[this._x1,this._y1]]}function k(e,t,r,a,o){this.node=e,this.x0=t,this.y0=r,this.x1=a,this.y1=o}function Je(e,t,r){var a,o=this._x0,f=this._y0,d,l,x,u,c=this._x1,w=this._y1,h=[],i=this._root,S,p;for(i&&h.push(new k(i,o,f,c,w)),r==null?r=1/0:(o=e-r,f=t-r,c=e+r,w=t+r,r*=r);S=h.pop();)if(!(!(i=S.node)||(d=S.x0)>c||(l=S.y0)>w||(x=S.x1)<o||(u=S.y1)<f))if(i.length){var s=(d+x)/2,n=(l+u)/2;h.push(new k(i[3],s,n,x,u),new k(i[2],d,n,s,u),new k(i[1],s,l,x,n),new k(i[0],d,l,s,n)),(p=(t>=n)<<1|e>=s)&&(S=h[h.length-1],h[h.length-1]=h[h.length-1-p],h[h.length-1-p]=S)}else{var g=e-+this._x.call(null,i.data),y=t-+this._y.call(null,i.data),C=g*g+y*y;if(C<r){var v=Math.sqrt(r=C);o=e-v,f=t-v,c=e+v,w=t+v,a=i.data}}return a}function Qe(e){if(isNaN(c=+this._x.call(null,e))||isNaN(w=+this._y.call(null,e)))return this;var t,r=this._root,a,o,f,d=this._x0,l=this._y0,x=this._x1,u=this._y1,c,w,h,i,S,p,s,n;if(!r)return this;if(r.length)for(;;){if((S=c>=(h=(d+x)/2))?d=h:x=h,(p=w>=(i=(l+u)/2))?l=i:u=i,t=r,!(r=r[s=p<<1|S]))return this;if(!r.length)break;(t[s+1&3]||t[s+2&3]||t[s+3&3])&&(a=t,n=s)}for(;r.data!==e;)if(o=r,!(r=r.next))return this;return(f=r.next)&&delete r.next,o?(f?o.next=f:delete o.next,this):t?(f?t[s]=f:delete t[s],(r=t[0]||t[1]||t[2]||t[3])&&r===(t[3]||t[2]||t[1]||t[0])&&!r.length&&(a?a[n]=r:this._root=r),this):(this._root=f,this)}function Ye(e){for(var t=0,r=e.length;t<r;++t)this.remove(e[t]);return this}function $e(){return this._root}function et(){var e=0;return this.visit(function(t){if(!t.length)do++e;while(t=t.next)}),e}function tt(e){var t=[],r,a=this._root,o,f,d,l,x;for(a&&t.push(new k(a,this._x0,this._y0,this._x1,this._y1));r=t.pop();)if(!e(a=r.node,f=r.x0,d=r.y0,l=r.x1,x=r.y1)&&a.length){var u=(f+l)/2,c=(d+x)/2;(o=a[3])&&t.push(new k(o,u,c,l,x)),(o=a[2])&&t.push(new k(o,f,c,u,x)),(o=a[1])&&t.push(new k(o,u,d,l,c)),(o=a[0])&&t.push(new k(o,f,d,u,c))}return this}function rt(e){var t=[],r=[],a;for(this._root&&t.push(new k(this._root,this._x0,this._y0,this._x1,this._y1));a=t.pop();){var o=a.node;if(o.length){var f,d=a.x0,l=a.y0,x=a.x1,u=a.y1,c=(d+x)/2,w=(l+u)/2;(f=o[0])&&t.push(new k(f,d,l,c,w)),(f=o[1])&&t.push(new k(f,c,l,x,w)),(f=o[2])&&t.push(new k(f,d,w,c,u)),(f=o[3])&&t.push(new k(f,c,w,x,u))}r.push(a)}for(;a=r.pop();)e(a.node,a.x0,a.y0,a.x1,a.y1);return this}function at(e){return e[0]}function ot(e){return arguments.length?(this._x=e,this):this._x}function ft(e){return e[1]}function lt(e){return arguments.length?(this._y=e,this):this._y}function U(e,t,r){var a=new Y(t??at,r??ft,NaN,NaN,NaN,NaN);return e==null?a:a.addAll(e)}function Y(e,t,r,a,o,f){this._x=e,this._y=t,this._x0=r,this._y0=a,this._x1=o,this._y1=f,this._root=void 0}function st(e){for(var t={data:e.data},r=t;e=e.next;)r=r.next={data:e.data};return t}var F=U.prototype=Y.prototype;F.copy=function(){var e=new Y(this._x,this._y,this._x0,this._y0,this._x1,this._y1),t=this._root,r,a;if(!t)return e;if(!t.length)return e._root=st(t),e;for(r=[{source:t,target:e._root=new Array(4)}];t=r.pop();)for(var o=0;o<4;++o)(a=t.source[o])&&(a.length?r.push({source:a,target:t.target[o]=new Array(4)}):t.target[o]=st(a));return e};F.add=Ge;F.addAll=Xe;F.cover=Ke;F.data=Ze;F.extent=je;F.find=Je;F.remove=Qe;F.removeAll=Ye;F.root=$e;F.size=et;F.visit=tt;F.visitAfter=rt;F.x=ot;F.y=lt;function A(e){return function(){return e}}function L(e){return(e()-.5)*1e-6}function Bt(e){return e.x+e.vx}function Ft(e){return e.y+e.vy}function $(e){var t,r,a,o=1,f=1;typeof e!="function"&&(e=A(e==null?1:+e));function d(){for(var u,c=t.length,w,h,i,S,p,s,n=0;n<f;++n)for(w=U(t,Bt,Ft).visitAfter(l),u=0;u<c;++u)h=t[u],p=r[h.index],s=p*p,i=h.x+h.vx,S=h.y+h.vy,w.visit(g);function g(y,C,v,B,D){var M=y.data,b=y.r,P=p+b;if(M){if(M.index>h.index){var T=i-M.x-M.vx,q=S-M.y-M.vy,R=T*T+q*q;R<P*P&&(T===0&&(T=L(a),R+=T*T),q===0&&(q=L(a),R+=q*q),R=(P-(R=Math.sqrt(R)))/R*o,h.vx+=(T*=R)*(P=(b*=b)/(s+b)),h.vy+=(q*=R)*P,M.vx-=T*(P=1-P),M.vy-=q*P)}return}return C>i+P||B<i-P||v>S+P||D<S-P}}function l(u){if(u.data)return u.r=r[u.data.index];for(var c=u.r=0;c<4;++c)u[c]&&u[c].r>u.r&&(u.r=u[c].r)}function x(){if(t){var u,c=t.length,w;for(r=new Array(c),u=0;u<c;++u)w=t[u],r[w.index]=+e(w,u,t)}}return d.initialize=function(u,c){t=u,a=c,x()},d.iterations=function(u){return arguments.length?(f=+u,d):f},d.strength=function(u){return arguments.length?(o=+u,d):o},d.radius=function(u){return arguments.length?(e=typeof u=="function"?u:A(+u),x(),d):e},d}function Dt(e){return e.index}function ut(e,t){var r=e.get(t);if(!r)throw new Error("node not found: "+t);return r}function ee(e){var t=Dt,r=w,a,o=A(30),f,d,l,x,u,c=1;e==null&&(e=[]);function w(s){return 1/Math.min(l[s.source.index],l[s.target.index])}function h(s){for(var n=0,g=e.length;n<c;++n)for(var y=0,C,v,B,D,M,b,P;y<g;++y)C=e[y],v=C.source,B=C.target,D=B.x+B.vx-v.x-v.vx||L(u),M=B.y+B.vy-v.y-v.vy||L(u),b=Math.sqrt(D*D+M*M),b=(b-f[y])/b*s*a[y],D*=b,M*=b,B.vx-=D*(P=x[y]),B.vy-=M*P,v.vx+=D*(P=1-P),v.vy+=M*P}function i(){if(d){var s,n=d.length,g=e.length,y=new Map(d.map((v,B)=>[t(v,B,d),v])),C;for(s=0,l=new Array(n);s<g;++s)C=e[s],C.index=s,typeof C.source!="object"&&(C.source=ut(y,C.source)),typeof C.target!="object"&&(C.target=ut(y,C.target)),l[C.source.index]=(l[C.source.index]||0)+1,l[C.target.index]=(l[C.target.index]||0)+1;for(s=0,x=new Array(g);s<g;++s)C=e[s],x[s]=l[C.source.index]/(l[C.source.index]+l[C.target.index]);a=new Array(g),S(),f=new Array(g),p()}}function S(){if(d)for(var s=0,n=e.length;s<n;++s)a[s]=+r(e[s],s,e)}function p(){if(d)for(var s=0,n=e.length;s<n;++s)f[s]=+o(e[s],s,e)}return h.initialize=function(s,n){d=s,u=n,i()},h.links=function(s){return arguments.length?(e=s,i(),h):e},h.id=function(s){return arguments.length?(t=s,h):t},h.iterations=function(s){return arguments.length?(c=+s,h):c},h.strength=function(s){return arguments.length?(r=typeof s=="function"?s:A(+s),S(),h):r},h.distance=function(s){return arguments.length?(o=typeof s=="function"?s:A(+s),p(),h):o},h}var bt={value:()=>{}};function pt(){for(var e=0,t=arguments.length,r={},a;e<t;++e){if(!(a=arguments[e]+"")||a in r||/[\s.]/.test(a))throw new Error("illegal type: "+a);r[a]=[]}return new V(r)}function V(e){this._=e}function Lt(e,t){return e.trim().split(/^|\s+/).map(function(r){var a="",o=r.indexOf(".");if(o>=0&&(a=r.slice(o+1),r=r.slice(0,o)),r&&!t.hasOwnProperty(r))throw new Error("unknown type: "+r);return{type:r,name:a}})}V.prototype=pt.prototype={constructor:V,on:function(e,t){var r=this._,a=Lt(e+"",r),o,f=-1,d=a.length;if(arguments.length<2){for(;++f<d;)if((o=(e=a[f]).type)&&(o=Rt(r[o],e.name)))return o;return}if(t!=null&&typeof t!="function")throw new Error("invalid callback: "+t);for(;++f<d;)if(o=(e=a[f]).type)r[o]=dt(r[o],e.name,t);else if(t==null)for(o in r)r[o]=dt(r[o],e.name,null);return this},copy:function(){var e={},t=this._;for(var r in t)e[r]=t[r].slice();return new V(e)},call:function(e,t){if((o=arguments.length-2)>0)for(var r=new Array(o),a=0,o,f;a<o;++a)r[a]=arguments[a+2];if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(f=this._[e],a=0,o=f.length;a<o;++a)f[a].value.apply(t,r)},apply:function(e,t,r){if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(var a=this._[e],o=0,f=a.length;o<f;++o)a[o].value.apply(t,r)}};function Rt(e,t){for(var r=0,a=e.length,o;r<a;++r)if((o=e[r]).name===t)return o.value}function dt(e,t,r){for(var a=0,o=e.length;a<o;++a)if(e[a].name===t){e[a]=bt,e=e.slice(0,a).concat(e.slice(a+1));break}return r!=null&&e.push({name:t,value:r}),e}var te=pt;var O=0,N=0,_=0,it=1e3,z,E,G=0,H=0,W=0,I=typeof performance=="object"&&performance.now?performance:Date,nt=typeof window=="object"&&window.requestAnimationFrame?window.requestAnimationFrame.bind(window):function(e){setTimeout(e,17)};function oe(){return H||(nt(Tt),H=I.now()+W)}function Tt(){H=0}function re(){this._call=this._time=this._next=null}re.prototype=X.prototype={constructor:re,restart:function(e,t,r){if(typeof e!="function")throw new TypeError("callback is not a function");r=(r==null?oe():+r)+(t==null?0:+t),!this._next&&E!==this&&(E?E._next=this:z=this,E=this),this._call=e,this._time=r,ae()},stop:function(){this._call&&(this._call=null,this._time=1/0,ae())}};function X(e,t,r){var a=new re;return a.restart(e,t,r),a}function xt(){oe(),++O;for(var e=z,t;e;)(t=H-e._time)>=0&&e._call.call(void 0,t),e=e._next;--O}function mt(){H=(G=I.now())+W,O=N=0;try{xt()}finally{O=0,Ut(),H=0}}function qt(){var e=I.now(),t=e-G;t>it&&(W-=t,G=e)}function Ut(){for(var e,t=z,r,a=1/0;t;)t._call?(a>t._time&&(a=t._time),e=t,t=t._next):(r=t._next,t._next=null,t=e?e._next=r:z=r);E=e,ae(a)}function ae(e){if(!O){N&&(N=clearTimeout(N));var t=e-H;t>24?(e<1/0&&(N=setTimeout(mt,e-I.now()-W)),_&&(_=clearInterval(_))):(_||(G=I.now(),_=setInterval(qt,it)),O=1,nt(mt))}}function ct(){let e=1;return()=>(e=(1664525*e+1013904223)%4294967296)/4294967296}function ht(e){return e.x}function gt(e){return e.y}var Ht=10,Ot=Math.PI*(3-Math.sqrt(5));function fe(e){var t,r=1,a=.001,o=1-Math.pow(a,1/300),f=0,d=.6,l=new Map,x=X(w),u=te("tick","end"),c=ct();e==null&&(e=[]);function w(){h(),u.call("tick",t),r<a&&(x.stop(),u.call("end",t))}function h(p){var s,n=e.length,g;p===void 0&&(p=1);for(var y=0;y<p;++y)for(r+=(f-r)*o,l.forEach(function(C){C(r)}),s=0;s<n;++s)g=e[s],g.fx==null?g.x+=g.vx*=d:(g.x=g.fx,g.vx=0),g.fy==null?g.y+=g.vy*=d:(g.y=g.fy,g.vy=0);return t}function i(){for(var p=0,s=e.length,n;p<s;++p){if(n=e[p],n.index=p,n.fx!=null&&(n.x=n.fx),n.fy!=null&&(n.y=n.fy),isNaN(n.x)||isNaN(n.y)){var g=Ht*Math.sqrt(.5+p),y=p*Ot;n.x=g*Math.cos(y),n.y=g*Math.sin(y)}(isNaN(n.vx)||isNaN(n.vy))&&(n.vx=n.vy=0)}}function S(p){return p.initialize&&p.initialize(e,c),p}return i(),t={tick:h,restart:function(){return x.restart(w),t},stop:function(){return x.stop(),t},nodes:function(p){return arguments.length?(e=p,i(),l.forEach(S),t):e},alpha:function(p){return arguments.length?(r=+p,t):r},alphaMin:function(p){return arguments.length?(a=+p,t):a},alphaDecay:function(p){return arguments.length?(o=+p,t):+o},alphaTarget:function(p){return arguments.length?(f=+p,t):f},velocityDecay:function(p){return arguments.length?(d=1-p,t):1-d},randomSource:function(p){return arguments.length?(c=p,l.forEach(S),t):c},force:function(p,s){return arguments.length>1?(s==null?l.delete(p):l.set(p,S(s)),t):l.get(p)},find:function(p,s,n){var g=0,y=e.length,C,v,B,D,M;for(n==null?n=1/0:n*=n,g=0;g<y;++g)D=e[g],C=p-D.x,v=s-D.y,B=C*C+v*v,B<n&&(M=D,n=B);return M},on:function(p,s){return arguments.length>1?(u.on(p,s),t):u.on(p)}}}function le(){var e,t,r,a,o=A(-30),f,d=1,l=1/0,x=.81;function u(i){var S,p=e.length,s=U(e,ht,gt).visitAfter(w);for(a=i,S=0;S<p;++S)t=e[S],s.visit(h)}function c(){if(e){var i,S=e.length,p;for(f=new Array(S),i=0;i<S;++i)p=e[i],f[p.index]=+o(p,i,e)}}function w(i){var S=0,p,s,n=0,g,y,C;if(i.length){for(g=y=C=0;C<4;++C)(p=i[C])&&(s=Math.abs(p.value))&&(S+=p.value,n+=s,g+=s*p.x,y+=s*p.y);i.x=g/n,i.y=y/n}else{p=i,p.x=p.data.x,p.y=p.data.y;do S+=f[p.data.index];while(p=p.next)}i.value=S}function h(i,S,p,s){if(!i.value)return!0;var n=i.x-t.x,g=i.y-t.y,y=s-S,C=n*n+g*g;if(y*y/x<C)return C<l&&(n===0&&(n=L(r),C+=n*n),g===0&&(g=L(r),C+=g*g),C<d&&(C=Math.sqrt(d*C)),t.vx+=n*i.value*a/C,t.vy+=g*i.value*a/C),!0;if(i.length||C>=l)return;(i.data!==t||i.next)&&(n===0&&(n=L(r),C+=n*n),g===0&&(g=L(r),C+=g*g),C<d&&(C=Math.sqrt(d*C)));do i.data!==t&&(y=f[i.data.index]*a/C,t.vx+=n*y,t.vy+=g*y);while(i=i.next)}return u.initialize=function(i,S){e=i,r=S,c()},u.strength=function(i){return arguments.length?(o=typeof i=="function"?i:A(+i),c(),u):o},u.distanceMin=function(i){return arguments.length?(d=i*i,u):Math.sqrt(d)},u.distanceMax=function(i){return arguments.length?(l=i*i,u):Math.sqrt(l)},u.theta=function(i){return arguments.length?(x=i*i,u):Math.sqrt(x)},u}function se(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var x=0,u=r.length,c;x<u;++x)c=r[x],c.vx+=(o[x]-c.x)*a[x]*l}function d(){if(r){var l,x=r.length;for(a=new Array(x),o=new Array(x),l=0;l<x;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,d()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),d(),f):t},f.x=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),d(),f):e},f}function ue(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var x=0,u=r.length,c;x<u;++x)c=r[x],c.vy+=(o[x]-c.y)*a[x]*l}function d(){if(r){var l,x=r.length;for(a=new Array(x),o=new Array(x),l=0;l<x;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,d()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),d(),f):t},f.y=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),d(),f):e},f}var Ct=(e,t,r=[])=>{let a=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.keys(t).forEach(o=>{a.setAttribute(o,String(t[o]))}),r.length&&r.forEach(o=>{let f=Ct(...o);a.appendChild(f)}),a},St=([e,t,r])=>Ct(e,t,r);var _t=e=>Array.from(e.attributes).reduce((t,r)=>(t[r.name]=r.value,t),{}),Nt=e=>typeof e=="string"?e:!e||!e.class?"":e.class&&typeof e.class=="string"?e.class.split(" "):e.class&&Array.isArray(e.class)?e.class:"",Et=e=>e.flatMap(Nt).map(r=>r.trim()).filter(Boolean).filter((r,a,o)=>o.indexOf(r)===a).join(" "),It=e=>e.replace(/(\w)(\w*)(_|-|\s*)/g,(t,r,a)=>r.toUpperCase()+a.toLowerCase()),de=(e,{nameAttr:t,icons:r,attrs:a})=>{let o=e.getAttribute(t);if(o==null)return;let f=It(o),d=r[f];if(!d)return console.warn(`${e.outerHTML} icon name was not found in the provided icons object.`);let l=_t(e),[x,u,c]=d,w={...u,"data-lucide":o,...a,...l},h=Et(["lucide",`lucide-${o}`,l,a]);h&&Object.assign(w,{class:h});let i=St([x,w,c]);return e.parentNode?.replaceChild(i,e)};var m={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};var pe=["svg",m,[["path",{d:"M12 5v14"}],["path",{d:"m19 12-7 7-7-7"}]]];var me=["svg",m,[["path",{d:"m5 12 7-7 7 7"}],["path",{d:"M12 19V5"}]]];var ie=["svg",m,[["path",{d:"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{d:"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{d:"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{d:"M10 6h4"}],["path",{d:"M10 10h4"}],["path",{d:"M10 14h4"}],["path",{d:"M10 18h4"}]]];var ne=["svg",m,[["path",{d:"M20 6 9 17l-5-5"}]]];var xe=["svg",m,[["path",{d:"m6 9 6 6 6-6"}]]];var ce=["svg",m,[["path",{d:"m9 18 6-6-6-6"}]]];var K=["svg",m,[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16"}]]];var Z=["svg",m,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"}],["path",{d:"M12 17h.01"}]]];var he=["svg",m,[["polyline",{points:"15 10 20 15 15 20"}],["path",{d:"M4 4v7a4 4 0 0 0 4 4h12"}]]];var ge=["svg",m,[["polyline",{points:"9 14 4 9 9 4"}],["path",{d:"M20 20v-7a4 4 0 0 0-4-4H4"}]]];var Ce=["svg",m,[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"7 10 12 15 17 10"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3"}]]];var j=["svg",m,[["circle",{cx:"12",cy:"12",r:"1"}],["circle",{cx:"19",cy:"12",r:"1"}],["circle",{cx:"5",cy:"12",r:"1"}]]];var Se=["svg",m,[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{d:"M10 9H8"}],["path",{d:"M16 13H8"}],["path",{d:"M16 17H8"}]]];var we=["svg",m,[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15"}]]];var ye=["svg",m,[["path",{d:"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"}],["path",{d:"M8 10v4"}],["path",{d:"M12 10v2"}],["path",{d:"M16 10v6"}]]];var ve=["svg",m,[["path",{d:"m16.02 12 5.48 3.13a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74L7.98 12"}],["path",{d:"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74Z"}]]];var Ae=["svg",m,[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12"}]]];var Me=["svg",m,[["path",{d:"M21 12h-8"}],["path",{d:"M21 6H8"}],["path",{d:"M21 18h-8"}],["path",{d:"M3 6v4c0 1.1.9 2 2 2h3"}],["path",{d:"M3 10v6c0 1.1.9 2 2 2h3"}]]];var Pe=["svg",m,[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}],["polyline",{points:"16 17 21 12 16 7"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12"}]]];var ke=["svg",m,[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]]];var Be=["svg",m,[["rect",{x:"16",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"2",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"9",y:"2",width:"6",height:"6",rx:"1"}],["path",{d:"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"}],["path",{d:"M12 12V8"}]]];var Fe=["svg",m,[["path",{d:"m16 16 2 2 4-4"}],["path",{d:"M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"}],["path",{d:"m7.5 4.27 9 5.15"}],["polyline",{points:"3.29 7 12 12 20.71 7"}],["line",{x1:"12",x2:"12",y1:"22",y2:"12"}]]];var De=["svg",m,[["path",{d:"M13.234 20.252 21 12.3"}],["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486"}]]];var be=["svg",m,[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{d:"m15 5 4 4"}]]];var Le=["svg",m,[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]]];var Re=["svg",m,[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]]];var Te=["svg",m,[["circle",{cx:"11",cy:"11",r:"8"}],["path",{d:"m21 21-4.3-4.3"}]]];var qe=["svg",m,[["path",{d:"M20 7h-9"}],["path",{d:"M14 17H5"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]]];var Ue=["svg",m,[["line",{x1:"21",x2:"14",y1:"4",y2:"4"}],["line",{x1:"10",x2:"3",y1:"4",y2:"4"}],["line",{x1:"21",x2:"12",y1:"12",y2:"12"}],["line",{x1:"8",x2:"3",y1:"12",y2:"12"}],["line",{x1:"21",x2:"16",y1:"20",y2:"20"}],["line",{x1:"12",x2:"3",y1:"20",y2:"20"}],["line",{x1:"14",x2:"14",y1:"2",y2:"6"}],["line",{x1:"8",x2:"8",y1:"10",y2:"14"}],["line",{x1:"16",x2:"16",y1:"18",y2:"22"}]]];var J=["svg",m,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"m9 12 2 2 4-4"}]]];var He=["svg",m,[["path",{d:"M5 22h14"}],["path",{d:"M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"}],["path",{d:"M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-3-3c-1.66 0-3 1-3 3s1 2 1 3.5V13"}]]];var Oe=["svg",m,[["path",{d:"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"}]]];var _e=["svg",m,[["path",{d:"M3 6h18"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17"}]]];var Ne=["svg",m,[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{cx:"9",cy:"7",r:"4"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75"}]]];var Ee=["svg",m,[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2"}]]];var Ie=["svg",m,[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]]];var Ve=["svg",m,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var ze=["svg",m,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var wt=({icons:e={},nameAttr:t="data-lucide",attrs:r={}}={})=>{if(!Object.values(e).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof document>"u")throw new Error("`createIcons()` only works in a browser environment.");let a=document.querySelectorAll(`[${t}]`);if(Array.from(a).forEach(o=>de(o,{nameAttr:t,icons:e,attrs:r})),t==="data-lucide"){let o=document.querySelectorAll("[icon-name]");o.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(o).forEach(f=>de(f,{nameAttr:"icon-name",icons:e,attrs:r})))}};var Vt={Network:Be,Workflow:Ee,Table2:Oe,Plus:Le,X:Ie,ChevronDown:xe,ChevronRight:ce,Search:Te,SlidersHorizontal:Ue,Settings2:qe,LogOut:Pe,Download:Ce,RotateCcw:Re,Maximize:ke,ZoomIn:Ve,ZoomOut:ze,Link2:Ae,Trash2:_e,Check:ne,MoreHorizontal:j,Users:Ne,Building2:ie,CircleHelp:Z,FolderKanban:ye,Layers2:ve,ListTree:Me,SquareCheck:J,Stamp:He,CircleAlert:K,PackageCheck:Fe,Flag:we,FileText:Se,Pencil:be,ArrowUp:me,ArrowDown:pe,CornerDownRight:he,CornerUpLeft:ge,Paperclip:De};function zt(){wt({icons:Vt,attrs:{"stroke-width":1.7,"aria-hidden":"true"}})}return kt(Gt);})();
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

lucide/dist/esm/icons/circle-help.js:
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

lucide/dist/esm/icons/list-tree.js:
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

lucide/dist/esm/icons/maximize.js:
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

lucide/dist/esm/icons/pencil.js:
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
