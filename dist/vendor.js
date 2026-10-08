var FluxosVendor=(()=>{var j=Object.defineProperty;var lt=Object.getOwnPropertyDescriptor;var st=Object.getOwnPropertyNames;var ut=Object.prototype.hasOwnProperty;var dt=(e,t)=>{for(var r in t)j(e,r,{get:t[r],enumerable:!0})},pt=(e,t,r,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of st(t))!ut.call(e,o)&&o!==r&&j(e,o,{get:()=>t[o],enumerable:!(a=lt(t,o))||a.enumerable});return e};var mt=e=>pt(j({},"__esModule",{value:!0}),e);var Ft={};dt(Ft,{forceCollide:()=>Q,forceLink:()=>Y,forceManyBody:()=>oe,forceSimulation:()=>ae,forceX:()=>fe,forceY:()=>le,mountIcons:()=>Dt});function Fe(e){let t=+this._x.call(null,e),r=+this._y.call(null,e);return Le(this.cover(t,r),t,r,e)}function Le(e,t,r,a){if(isNaN(t)||isNaN(r))return e;var o,f=e._root,d={data:a},l=e._x0,n=e._y0,u=e._x1,x=e._y1,w,c,m,S,p,s,i,h;if(!f)return e._root=d,e;for(;f.length;)if((p=t>=(w=(l+u)/2))?l=w:u=w,(s=r>=(c=(n+x)/2))?n=c:x=c,o=f,!(f=f[i=s<<1|p]))return o[i]=d,e;if(m=+e._x.call(null,f.data),S=+e._y.call(null,f.data),t===m&&r===S)return d.next=f,o?o[i]=d:e._root=d,e;do o=o?o[i]=new Array(4):e._root=new Array(4),(p=t>=(w=(l+u)/2))?l=w:u=w,(s=r>=(c=(n+x)/2))?n=c:x=c;while((i=s<<1|p)===(h=(S>=c)<<1|m>=w));return o[h]=f,o[i]=d,e}function be(e){var t,r,a=e.length,o,f,d=new Array(a),l=new Array(a),n=1/0,u=1/0,x=-1/0,w=-1/0;for(r=0;r<a;++r)isNaN(o=+this._x.call(null,t=e[r]))||isNaN(f=+this._y.call(null,t))||(d[r]=o,l[r]=f,o<n&&(n=o),o>x&&(x=o),f<u&&(u=f),f>w&&(w=f));if(n>x||u>w)return this;for(this.cover(n,u).cover(x,w),r=0;r<a;++r)Le(this,d[r],l[r],e[r]);return this}function Re(e,t){if(isNaN(e=+e)||isNaN(t=+t))return this;var r=this._x0,a=this._y0,o=this._x1,f=this._y1;if(isNaN(r))o=(r=Math.floor(e))+1,f=(a=Math.floor(t))+1;else{for(var d=o-r||1,l=this._root,n,u;r>e||e>=o||a>t||t>=f;)switch(u=(t<a)<<1|e<r,n=new Array(4),n[u]=l,l=n,d*=2,u){case 0:o=r+d,f=a+d;break;case 1:r=o-d,f=a+d;break;case 2:o=r+d,a=f-d;break;case 3:r=o-d,a=f-d;break}this._root&&this._root.length&&(this._root=l)}return this._x0=r,this._y0=a,this._x1=o,this._y1=f,this}function Te(){var e=[];return this.visit(function(t){if(!t.length)do e.push(t.data);while(t=t.next)}),e}function qe(e){return arguments.length?this.cover(+e[0][0],+e[0][1]).cover(+e[1][0],+e[1][1]):isNaN(this._x0)?void 0:[[this._x0,this._y0],[this._x1,this._y1]]}function M(e,t,r,a,o){this.node=e,this.x0=t,this.y0=r,this.x1=a,this.y1=o}function Ue(e,t,r){var a,o=this._x0,f=this._y0,d,l,n,u,x=this._x1,w=this._y1,c=[],m=this._root,S,p;for(m&&c.push(new M(m,o,f,x,w)),r==null?r=1/0:(o=e-r,f=t-r,x=e+r,w=t+r,r*=r);S=c.pop();)if(!(!(m=S.node)||(d=S.x0)>x||(l=S.y0)>w||(n=S.x1)<o||(u=S.y1)<f))if(m.length){var s=(d+n)/2,i=(l+u)/2;c.push(new M(m[3],s,i,n,u),new M(m[2],d,i,s,u),new M(m[1],s,l,n,i),new M(m[0],d,l,s,i)),(p=(t>=i)<<1|e>=s)&&(S=c[c.length-1],c[c.length-1]=c[c.length-1-p],c[c.length-1-p]=S)}else{var h=e-+this._x.call(null,m.data),y=t-+this._y.call(null,m.data),g=h*h+y*y;if(g<r){var v=Math.sqrt(r=g);o=e-v,f=t-v,x=e+v,w=t+v,a=m.data}}return a}function Oe(e){if(isNaN(x=+this._x.call(null,e))||isNaN(w=+this._y.call(null,e)))return this;var t,r=this._root,a,o,f,d=this._x0,l=this._y0,n=this._x1,u=this._y1,x,w,c,m,S,p,s,i;if(!r)return this;if(r.length)for(;;){if((S=x>=(c=(d+n)/2))?d=c:n=c,(p=w>=(m=(l+u)/2))?l=m:u=m,t=r,!(r=r[s=p<<1|S]))return this;if(!r.length)break;(t[s+1&3]||t[s+2&3]||t[s+3&3])&&(a=t,i=s)}for(;r.data!==e;)if(o=r,!(r=r.next))return this;return(f=r.next)&&delete r.next,o?(f?o.next=f:delete o.next,this):t?(f?t[s]=f:delete t[s],(r=t[0]||t[1]||t[2]||t[3])&&r===(t[3]||t[2]||t[1]||t[0])&&!r.length&&(a?a[i]=r:this._root=r),this):(this._root=f,this)}function He(e){for(var t=0,r=e.length;t<r;++t)this.remove(e[t]);return this}function _e(){return this._root}function Ne(){var e=0;return this.visit(function(t){if(!t.length)do++e;while(t=t.next)}),e}function Ee(e){var t=[],r,a=this._root,o,f,d,l,n;for(a&&t.push(new M(a,this._x0,this._y0,this._x1,this._y1));r=t.pop();)if(!e(a=r.node,f=r.x0,d=r.y0,l=r.x1,n=r.y1)&&a.length){var u=(f+l)/2,x=(d+n)/2;(o=a[3])&&t.push(new M(o,u,x,l,n)),(o=a[2])&&t.push(new M(o,f,x,u,n)),(o=a[1])&&t.push(new M(o,u,d,l,x)),(o=a[0])&&t.push(new M(o,f,d,u,x))}return this}function Ie(e){var t=[],r=[],a;for(this._root&&t.push(new M(this._root,this._x0,this._y0,this._x1,this._y1));a=t.pop();){var o=a.node;if(o.length){var f,d=a.x0,l=a.y0,n=a.x1,u=a.y1,x=(d+n)/2,w=(l+u)/2;(f=o[0])&&t.push(new M(f,d,l,x,w)),(f=o[1])&&t.push(new M(f,x,l,n,w)),(f=o[2])&&t.push(new M(f,d,w,x,u)),(f=o[3])&&t.push(new M(f,x,w,n,u))}r.push(a)}for(;a=r.pop();)e(a.node,a.x0,a.y0,a.x1,a.y1);return this}function ze(e){return e[0]}function Ge(e){return arguments.length?(this._x=e,this):this._x}function Ve(e){return e[1]}function We(e){return arguments.length?(this._y=e,this):this._y}function U(e,t,r){var a=new J(t??ze,r??Ve,NaN,NaN,NaN,NaN);return e==null?a:a.addAll(e)}function J(e,t,r,a,o,f){this._x=e,this._y=t,this._x0=r,this._y0=a,this._x1=o,this._y1=f,this._root=void 0}function Xe(e){for(var t={data:e.data},r=t;e=e.next;)r=r.next={data:e.data};return t}var D=U.prototype=J.prototype;D.copy=function(){var e=new J(this._x,this._y,this._x0,this._y0,this._x1,this._y1),t=this._root,r,a;if(!t)return e;if(!t.length)return e._root=Xe(t),e;for(r=[{source:t,target:e._root=new Array(4)}];t=r.pop();)for(var o=0;o<4;++o)(a=t.source[o])&&(a.length?r.push({source:a,target:t.target[o]=new Array(4)}):t.target[o]=Xe(a));return e};D.add=Fe;D.addAll=be;D.cover=Re;D.data=Te;D.extent=qe;D.find=Ue;D.remove=Oe;D.removeAll=He;D.root=_e;D.size=Ne;D.visit=Ee;D.visitAfter=Ie;D.x=Ge;D.y=We;function A(e){return function(){return e}}function b(e){return(e()-.5)*1e-6}function it(e){return e.x+e.vx}function nt(e){return e.y+e.vy}function Q(e){var t,r,a,o=1,f=1;typeof e!="function"&&(e=A(e==null?1:+e));function d(){for(var u,x=t.length,w,c,m,S,p,s,i=0;i<f;++i)for(w=U(t,it,nt).visitAfter(l),u=0;u<x;++u)c=t[u],p=r[c.index],s=p*p,m=c.x+c.vx,S=c.y+c.vy,w.visit(h);function h(y,g,v,B,F){var P=y.data,L=y.r,k=p+L;if(P){if(P.index>c.index){var T=m-P.x-P.vx,q=S-P.y-P.vy,R=T*T+q*q;R<k*k&&(T===0&&(T=b(a),R+=T*T),q===0&&(q=b(a),R+=q*q),R=(k-(R=Math.sqrt(R)))/R*o,c.vx+=(T*=R)*(k=(L*=L)/(s+L)),c.vy+=(q*=R)*k,P.vx-=T*(k=1-k),P.vy-=q*k)}return}return g>m+k||B<m-k||v>S+k||F<S-k}}function l(u){if(u.data)return u.r=r[u.data.index];for(var x=u.r=0;x<4;++x)u[x]&&u[x].r>u.r&&(u.r=u[x].r)}function n(){if(t){var u,x=t.length,w;for(r=new Array(x),u=0;u<x;++u)w=t[u],r[w.index]=+e(w,u,t)}}return d.initialize=function(u,x){t=u,a=x,n()},d.iterations=function(u){return arguments.length?(f=+u,d):f},d.strength=function(u){return arguments.length?(o=+u,d):o},d.radius=function(u){return arguments.length?(e=typeof u=="function"?u:A(+u),n(),d):e},d}function xt(e){return e.index}function Ke(e,t){var r=e.get(t);if(!r)throw new Error("node not found: "+t);return r}function Y(e){var t=xt,r=w,a,o=A(30),f,d,l,n,u,x=1;e==null&&(e=[]);function w(s){return 1/Math.min(l[s.source.index],l[s.target.index])}function c(s){for(var i=0,h=e.length;i<x;++i)for(var y=0,g,v,B,F,P,L,k;y<h;++y)g=e[y],v=g.source,B=g.target,F=B.x+B.vx-v.x-v.vx||b(u),P=B.y+B.vy-v.y-v.vy||b(u),L=Math.sqrt(F*F+P*P),L=(L-f[y])/L*s*a[y],F*=L,P*=L,B.vx-=F*(k=n[y]),B.vy-=P*k,v.vx+=F*(k=1-k),v.vy+=P*k}function m(){if(d){var s,i=d.length,h=e.length,y=new Map(d.map((v,B)=>[t(v,B,d),v])),g;for(s=0,l=new Array(i);s<h;++s)g=e[s],g.index=s,typeof g.source!="object"&&(g.source=Ke(y,g.source)),typeof g.target!="object"&&(g.target=Ke(y,g.target)),l[g.source.index]=(l[g.source.index]||0)+1,l[g.target.index]=(l[g.target.index]||0)+1;for(s=0,n=new Array(h);s<h;++s)g=e[s],n[s]=l[g.source.index]/(l[g.source.index]+l[g.target.index]);a=new Array(h),S(),f=new Array(h),p()}}function S(){if(d)for(var s=0,i=e.length;s<i;++s)a[s]=+r(e[s],s,e)}function p(){if(d)for(var s=0,i=e.length;s<i;++s)f[s]=+o(e[s],s,e)}return c.initialize=function(s,i){d=s,u=i,m()},c.links=function(s){return arguments.length?(e=s,m(),c):e},c.id=function(s){return arguments.length?(t=s,c):t},c.iterations=function(s){return arguments.length?(x=+s,c):x},c.strength=function(s){return arguments.length?(r=typeof s=="function"?s:A(+s),S(),c):r},c.distance=function(s){return arguments.length?(o=typeof s=="function"?s:A(+s),p(),c):o},c}var ct={value:()=>{}};function je(){for(var e=0,t=arguments.length,r={},a;e<t;++e){if(!(a=arguments[e]+"")||a in r||/[\s.]/.test(a))throw new Error("illegal type: "+a);r[a]=[]}return new z(r)}function z(e){this._=e}function ht(e,t){return e.trim().split(/^|\s+/).map(function(r){var a="",o=r.indexOf(".");if(o>=0&&(a=r.slice(o+1),r=r.slice(0,o)),r&&!t.hasOwnProperty(r))throw new Error("unknown type: "+r);return{type:r,name:a}})}z.prototype=je.prototype={constructor:z,on:function(e,t){var r=this._,a=ht(e+"",r),o,f=-1,d=a.length;if(arguments.length<2){for(;++f<d;)if((o=(e=a[f]).type)&&(o=gt(r[o],e.name)))return o;return}if(t!=null&&typeof t!="function")throw new Error("invalid callback: "+t);for(;++f<d;)if(o=(e=a[f]).type)r[o]=Ze(r[o],e.name,t);else if(t==null)for(o in r)r[o]=Ze(r[o],e.name,null);return this},copy:function(){var e={},t=this._;for(var r in t)e[r]=t[r].slice();return new z(e)},call:function(e,t){if((o=arguments.length-2)>0)for(var r=new Array(o),a=0,o,f;a<o;++a)r[a]=arguments[a+2];if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(f=this._[e],a=0,o=f.length;a<o;++a)f[a].value.apply(t,r)},apply:function(e,t,r){if(!this._.hasOwnProperty(e))throw new Error("unknown type: "+e);for(var a=this._[e],o=0,f=a.length;o<f;++o)a[o].value.apply(t,r)}};function gt(e,t){for(var r=0,a=e.length,o;r<a;++r)if((o=e[r]).name===t)return o.value}function Ze(e,t,r){for(var a=0,o=e.length;a<o;++a)if(e[a].name===t){e[a]=ct,e=e.slice(0,a).concat(e.slice(a+1));break}return r!=null&&e.push({name:t,value:r}),e}var $=je;var H=0,N=0,_=0,Qe=1e3,G,E,V=0,O=0,W=0,I=typeof performance=="object"&&performance.now?performance:Date,Ye=typeof window=="object"&&window.requestAnimationFrame?window.requestAnimationFrame.bind(window):function(e){setTimeout(e,17)};function re(){return O||(Ye(Ct),O=I.now()+W)}function Ct(){O=0}function ee(){this._call=this._time=this._next=null}ee.prototype=X.prototype={constructor:ee,restart:function(e,t,r){if(typeof e!="function")throw new TypeError("callback is not a function");r=(r==null?re():+r)+(t==null?0:+t),!this._next&&E!==this&&(E?E._next=this:G=this,E=this),this._call=e,this._time=r,te()},stop:function(){this._call&&(this._call=null,this._time=1/0,te())}};function X(e,t,r){var a=new ee;return a.restart(e,t,r),a}function $e(){re(),++H;for(var e=G,t;e;)(t=O-e._time)>=0&&e._call.call(void 0,t),e=e._next;--H}function Je(){O=(V=I.now())+W,H=N=0;try{$e()}finally{H=0,wt(),O=0}}function St(){var e=I.now(),t=e-V;t>Qe&&(W-=t,V=e)}function wt(){for(var e,t=G,r,a=1/0;t;)t._call?(a>t._time&&(a=t._time),e=t,t=t._next):(r=t._next,t._next=null,t=e?e._next=r:G=r);E=e,te(a)}function te(e){if(!H){N&&(N=clearTimeout(N));var t=e-O;t>24?(e<1/0&&(N=setTimeout(Je,e-I.now()-W)),_&&(_=clearInterval(_))):(_||(V=I.now(),_=setInterval(St,Qe)),H=1,Ye(Je))}}function et(){let e=1;return()=>(e=(1664525*e+1013904223)%4294967296)/4294967296}function tt(e){return e.x}function rt(e){return e.y}var yt=10,vt=Math.PI*(3-Math.sqrt(5));function ae(e){var t,r=1,a=.001,o=1-Math.pow(a,1/300),f=0,d=.6,l=new Map,n=X(w),u=$("tick","end"),x=et();e==null&&(e=[]);function w(){c(),u.call("tick",t),r<a&&(n.stop(),u.call("end",t))}function c(p){var s,i=e.length,h;p===void 0&&(p=1);for(var y=0;y<p;++y)for(r+=(f-r)*o,l.forEach(function(g){g(r)}),s=0;s<i;++s)h=e[s],h.fx==null?h.x+=h.vx*=d:(h.x=h.fx,h.vx=0),h.fy==null?h.y+=h.vy*=d:(h.y=h.fy,h.vy=0);return t}function m(){for(var p=0,s=e.length,i;p<s;++p){if(i=e[p],i.index=p,i.fx!=null&&(i.x=i.fx),i.fy!=null&&(i.y=i.fy),isNaN(i.x)||isNaN(i.y)){var h=yt*Math.sqrt(.5+p),y=p*vt;i.x=h*Math.cos(y),i.y=h*Math.sin(y)}(isNaN(i.vx)||isNaN(i.vy))&&(i.vx=i.vy=0)}}function S(p){return p.initialize&&p.initialize(e,x),p}return m(),t={tick:c,restart:function(){return n.restart(w),t},stop:function(){return n.stop(),t},nodes:function(p){return arguments.length?(e=p,m(),l.forEach(S),t):e},alpha:function(p){return arguments.length?(r=+p,t):r},alphaMin:function(p){return arguments.length?(a=+p,t):a},alphaDecay:function(p){return arguments.length?(o=+p,t):+o},alphaTarget:function(p){return arguments.length?(f=+p,t):f},velocityDecay:function(p){return arguments.length?(d=1-p,t):1-d},randomSource:function(p){return arguments.length?(x=p,l.forEach(S),t):x},force:function(p,s){return arguments.length>1?(s==null?l.delete(p):l.set(p,S(s)),t):l.get(p)},find:function(p,s,i){var h=0,y=e.length,g,v,B,F,P;for(i==null?i=1/0:i*=i,h=0;h<y;++h)F=e[h],g=p-F.x,v=s-F.y,B=g*g+v*v,B<i&&(P=F,i=B);return P},on:function(p,s){return arguments.length>1?(u.on(p,s),t):u.on(p)}}}function oe(){var e,t,r,a,o=A(-30),f,d=1,l=1/0,n=.81;function u(m){var S,p=e.length,s=U(e,tt,rt).visitAfter(w);for(a=m,S=0;S<p;++S)t=e[S],s.visit(c)}function x(){if(e){var m,S=e.length,p;for(f=new Array(S),m=0;m<S;++m)p=e[m],f[p.index]=+o(p,m,e)}}function w(m){var S=0,p,s,i=0,h,y,g;if(m.length){for(h=y=g=0;g<4;++g)(p=m[g])&&(s=Math.abs(p.value))&&(S+=p.value,i+=s,h+=s*p.x,y+=s*p.y);m.x=h/i,m.y=y/i}else{p=m,p.x=p.data.x,p.y=p.data.y;do S+=f[p.data.index];while(p=p.next)}m.value=S}function c(m,S,p,s){if(!m.value)return!0;var i=m.x-t.x,h=m.y-t.y,y=s-S,g=i*i+h*h;if(y*y/n<g)return g<l&&(i===0&&(i=b(r),g+=i*i),h===0&&(h=b(r),g+=h*h),g<d&&(g=Math.sqrt(d*g)),t.vx+=i*m.value*a/g,t.vy+=h*m.value*a/g),!0;if(m.length||g>=l)return;(m.data!==t||m.next)&&(i===0&&(i=b(r),g+=i*i),h===0&&(h=b(r),g+=h*h),g<d&&(g=Math.sqrt(d*g)));do m.data!==t&&(y=f[m.data.index]*a/g,t.vx+=i*y,t.vy+=h*y);while(m=m.next)}return u.initialize=function(m,S){e=m,r=S,x()},u.strength=function(m){return arguments.length?(o=typeof m=="function"?m:A(+m),x(),u):o},u.distanceMin=function(m){return arguments.length?(d=m*m,u):Math.sqrt(d)},u.distanceMax=function(m){return arguments.length?(l=m*m,u):Math.sqrt(l)},u.theta=function(m){return arguments.length?(n=m*m,u):Math.sqrt(n)},u}function fe(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var n=0,u=r.length,x;n<u;++n)x=r[n],x.vx+=(o[n]-x.x)*a[n]*l}function d(){if(r){var l,n=r.length;for(a=new Array(n),o=new Array(n),l=0;l<n;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,d()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),d(),f):t},f.x=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),d(),f):e},f}function le(e){var t=A(.1),r,a,o;typeof e!="function"&&(e=A(e==null?0:+e));function f(l){for(var n=0,u=r.length,x;n<u;++n)x=r[n],x.vy+=(o[n]-x.y)*a[n]*l}function d(){if(r){var l,n=r.length;for(a=new Array(n),o=new Array(n),l=0;l<n;++l)a[l]=isNaN(o[l]=+e(r[l],l,r))?0:+t(r[l],l,r)}}return f.initialize=function(l){r=l,d()},f.strength=function(l){return arguments.length?(t=typeof l=="function"?l:A(+l),d(),f):t},f.y=function(l){return arguments.length?(e=typeof l=="function"?l:A(+l),d(),f):e},f}var at=(e,t,r=[])=>{let a=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.keys(t).forEach(o=>{a.setAttribute(o,String(t[o]))}),r.length&&r.forEach(o=>{let f=at(...o);a.appendChild(f)}),a},ot=([e,t,r])=>at(e,t,r);var At=e=>Array.from(e.attributes).reduce((t,r)=>(t[r.name]=r.value,t),{}),Pt=e=>typeof e=="string"?e:!e||!e.class?"":e.class&&typeof e.class=="string"?e.class.split(" "):e.class&&Array.isArray(e.class)?e.class:"",kt=e=>e.flatMap(Pt).map(r=>r.trim()).filter(Boolean).filter((r,a,o)=>o.indexOf(r)===a).join(" "),Mt=e=>e.replace(/(\w)(\w*)(_|-|\s*)/g,(t,r,a)=>r.toUpperCase()+a.toLowerCase()),se=(e,{nameAttr:t,icons:r,attrs:a})=>{let o=e.getAttribute(t);if(o==null)return;let f=Mt(o),d=r[f];if(!d)return console.warn(`${e.outerHTML} icon name was not found in the provided icons object.`);let l=At(e),[n,u,x]=d,w={...u,"data-lucide":o,...a,...l},c=kt(["lucide",`lucide-${o}`,l,a]);c&&Object.assign(w,{class:c});let m=ot([n,w,x]);return e.parentNode?.replaceChild(m,e)};var C={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};var ue=["svg",C,[["path",{d:"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{d:"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{d:"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{d:"M10 6h4"}],["path",{d:"M10 10h4"}],["path",{d:"M10 14h4"}],["path",{d:"M10 18h4"}]]];var de=["svg",C,[["path",{d:"M20 6 9 17l-5-5"}]]];var pe=["svg",C,[["path",{d:"m6 9 6 6 6-6"}]]];var me=["svg",C,[["path",{d:"m9 18 6-6-6-6"}]]];var K=["svg",C,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"}],["path",{d:"M12 17h.01"}]]];var ie=["svg",C,[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"7 10 12 15 17 10"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3"}]]];var Z=["svg",C,[["circle",{cx:"12",cy:"12",r:"1"}],["circle",{cx:"19",cy:"12",r:"1"}],["circle",{cx:"5",cy:"12",r:"1"}]]];var ne=["svg",C,[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12"}]]];var xe=["svg",C,[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}],["polyline",{points:"16 17 21 12 16 7"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12"}]]];var ce=["svg",C,[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]]];var he=["svg",C,[["rect",{x:"16",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"2",y:"16",width:"6",height:"6",rx:"1"}],["rect",{x:"9",y:"2",width:"6",height:"6",rx:"1"}],["path",{d:"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"}],["path",{d:"M12 12V8"}]]];var ge=["svg",C,[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]]];var Ce=["svg",C,[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]]];var Se=["svg",C,[["circle",{cx:"11",cy:"11",r:"8"}],["path",{d:"m21 21-4.3-4.3"}]]];var we=["svg",C,[["path",{d:"M20 7h-9"}],["path",{d:"M14 17H5"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]]];var ye=["svg",C,[["line",{x1:"21",x2:"14",y1:"4",y2:"4"}],["line",{x1:"10",x2:"3",y1:"4",y2:"4"}],["line",{x1:"21",x2:"12",y1:"12",y2:"12"}],["line",{x1:"8",x2:"3",y1:"12",y2:"12"}],["line",{x1:"21",x2:"16",y1:"20",y2:"20"}],["line",{x1:"12",x2:"3",y1:"20",y2:"20"}],["line",{x1:"14",x2:"14",y1:"2",y2:"6"}],["line",{x1:"8",x2:"8",y1:"10",y2:"14"}],["line",{x1:"16",x2:"16",y1:"18",y2:"22"}]]];var ve=["svg",C,[["path",{d:"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"}]]];var Ae=["svg",C,[["path",{d:"M3 6h18"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17"}]]];var Pe=["svg",C,[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{cx:"9",cy:"7",r:"4"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75"}]]];var ke=["svg",C,[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2"}]]];var Me=["svg",C,[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]]];var Be=["svg",C,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var De=["svg",C,[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]]];var ft=({icons:e={},nameAttr:t="data-lucide",attrs:r={}}={})=>{if(!Object.values(e).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof document>"u")throw new Error("`createIcons()` only works in a browser environment.");let a=document.querySelectorAll(`[${t}]`);if(Array.from(a).forEach(o=>se(o,{nameAttr:t,icons:e,attrs:r})),t==="data-lucide"){let o=document.querySelectorAll("[icon-name]");o.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(o).forEach(f=>se(f,{nameAttr:"icon-name",icons:e,attrs:r})))}};var Bt={Network:he,Workflow:ke,Table2:ve,Plus:ge,X:Me,ChevronDown:pe,ChevronRight:me,Search:Se,SlidersHorizontal:ye,Settings2:we,LogOut:xe,Download:ie,RotateCcw:Ce,Maximize:ce,ZoomIn:Be,ZoomOut:De,Link2:ne,Trash2:Ae,Check:de,MoreHorizontal:Z,Users:Pe,Building2:ue,CircleHelp:K};function Dt(){ft({icons:Bt,attrs:{"stroke-width":1.7,"aria-hidden":"true"}})}return mt(Ft);})();
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

lucide/dist/esm/icons/circle-help.js:
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

lucide/dist/esm/icons/link-2.js:
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
