/* Raw WebGL shaders for the landing wordmark orb, adapted from the ThreeUI
   energy-orb reference: a procedural smoke sphere (value-noise fbm) with a
   fresnel rim and outer glow, recoloured to SlideSage's signature navy and
   steel palette. The sphere surface samples a repeating "SlideSage" texture
   through spherical coordinates of the rotating normal, so one wordmark
   rotates out of view while the next rotates in. */

export const WORDMARK_ORB_VERTEX_SHADER =
	"attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export const WORDMARK_ORB_FRAGMENT_SHADER = [
	"precision highp float;",
	"uniform float uT;uniform vec2 uR;uniform sampler2D uW;",
	"float hash(vec3 p){p=fract(p*0.3183099+vec3(0.1,0.2,0.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
	"float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);",
	" return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),",
	" mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}",
	"float fbm(vec3 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec3(1.7);a*=0.5;}return v;}",
	"void main(){",
	" vec2 uv=(gl_FragCoord.xy-0.5*uR)/min(uR.x,uR.y);",
	" float r=length(uv);",
	" float R=0.34;",
	" vec3 col=vec3(0.0);float alpha=0.0;",
	" if(r<R){",
	"   float z=sqrt(R*R-r*r);",
	"   vec3 n=normalize(vec3(uv,z));",
	"   float ca=uT*0.2417;",
	"   mat3 rot=mat3(cos(ca),0.,sin(ca),0.,1.,0.,-sin(ca),0.,cos(ca));",
	"   vec3 sp=rot*n;",
	"   float f1=fbm(sp*2.6+vec3(0.0,uT*0.12,0.0));",
	"   float f2=fbm(sp*4.5-vec3(uT*0.08,0.0,uT*0.05)+f1*1.8);",
	"   float veil=smoothstep(0.35,0.75,f2);",
	"   vec3 deep=vec3(0.016,0.078,0.176);",
	"   vec3 mid=vec3(0.051,0.216,0.384);",
	"   vec3 bright=vec3(0.55,0.68,0.82);",
	"   col=mix(deep,mid,f1*1.2);",
	"   col=mix(col,bright,veil*0.55);",
	"   float fres=pow(1.0-z/R,2.2);",
	"   col+=vec3(0.35,0.52,0.74)*fres*0.95;",
	"   float top=pow(max(dot(n,normalize(vec3(0.0,0.7,0.7))),0.0),3.0);",
	"   col+=vec3(0.30,0.44,0.62)*top*0.30;",
	"   float u=fract(0.5+atan(sp.x,sp.z)/6.28318530718);",
	"   float v=0.5-asin(clamp(sp.y,-1.0,1.0))/3.14159265359;",
	"   vec4 mark=texture2D(uW,vec2(u,v));",
	"   float shade=0.72+0.5*f1;",
	"   col=mix(col,mark.rgb*shade,mark.a*0.94);",
	"   alpha=1.0;",
	" }",
	" float glow=exp(-(r-R)*14.0);",
	" if(r>=R){",
	"   glow=clamp(glow,0.0,1.0);",
	"   col=vec3(0.36,0.53,0.75)*glow*0.7;",
	"   alpha=glow*0.8;",
	" } else {",
	"   float rim=smoothstep(R-0.03,R,r);",
	"   col+=vec3(0.40,0.55,0.76)*rim*0.5;",
	" }",
	" gl_FragColor=vec4(col,alpha);",
	"}",
].join("\n");
