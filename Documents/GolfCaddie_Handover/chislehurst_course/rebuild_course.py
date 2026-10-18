import json,math,csv,xml.etree.ElementTree as E
from pathlib import Path as FilePath
from matplotlib.path import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
ROOT=FilePath(__file__).resolve().parent; OUT=ROOT
r=E.parse(ROOT/'chislehurst-source.osm').getroot()
LAT0,LON0=51.413,0.063; SX=111195*math.cos(math.radians(LAT0));SY=111195
nodes={e.attrib['id']:(float(e.attrib['lat']),float(e.attrib['lon'])) for e in r.findall('node')}
def xy(p):return ((p[1]-LON0)*SX,(p[0]-LAT0)*SY)
def coord(p):return {'latitude':round(p[1]/SY+LAT0,7),'longitude':round(p[0]/SX+LON0,7)}
def centroid(v):
 a=x=y=0
 for p,q in zip(v,v[1:]+v[:1]):
  z=p[0]*q[1]-q[0]*p[1];a+=z;x+=(p[0]+q[0])*z;y+=(p[1]+q[1])*z
 return (x/(3*a),y/(3*a))
ways=[]
for e in r.findall('way'):
 t={x.attrib['k']:x.attrib['v'] for x in e.findall('tag')}
 if t.get('golf') not in ['hole','tee','green']:continue
 ways.append({'id':int(e.attrib['id']),'tags':t,'xy':[xy(nodes[n.attrib['ref']]) for n in e.findall('nd')],'timestamp':e.attrib['timestamp'],'version':int(e.attrib['version'])})
holes=sorted([w for w in ways if w['tags']['golf']=='hole'],key=lambda w:int(w['tags']['ref']))
greens=[w for w in ways if w['tags']['golf']=='green'];tees=[w for w in ways if w['tags']['golf']=='tee']
lengths={'white':[504,370,235,313,105,409,139,206,350,176,410,138,163,492,355,331,144,277],'yellow':[488,346,220,309,100,397,126,196,338,167,408,130,160,460,349,320,138,267],'red':[479,365,232,306,94,373,101,180,328,164,400,117,156,401,343,316,131,261]}
pars=[5,4,3,4,3,4,3,3,4,3,4,3,3,5,4,4,3,4];si=[11,7,3,15,17,1,13,5,9,12,4,18,8,2,14,10,6,16]
redpar=[5,5,4,4,3,4,3,3,4,3,5,3,3,5,4,4,3,4];redsi=[7,11,15,5,17,1,13,9,3,12,4,18,14,6,2,10,8,16]
ratings={'white':[{'sex':'male','courseRating':65.5,'slopeRating':124}],'yellow':[{'sex':'male','courseRating':64.7,'slopeRating':120},{'sex':'female','courseRating':70.1,'slopeRating':132}],'red':[{'sex':'male','courseRating':64.0,'slopeRating':118},{'sex':'female','courseRating':68.9,'slopeRating':129}]}
for colour in ratings:
 for a in ratings[colour]:a['verification']='secondary_source_only'
def advance(p,d):
 for a,b in zip(p,p[1:]):
  l=math.dist(a,b)
  if d<=l:return(a[0]+(b[0]-a[0])*d/l,a[1]+(b[1]-a[1])*d/l)
  d-=l
 return p[-1]
def closest(p,poly):
 if Path(poly).contains_point(p):return p,0
 candidates=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  dx,dy=b[0]-a[0],b[1]-a[1];dd=dx*dx+dy*dy
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd)) if dd else 0
  q=(a[0]+t*dx,a[1]+t*dy);candidates.append((math.dist(q,p),q))
 dist,q=min(candidates);c=centroid(poly);q=(.999*q[0]+.001*c[0],.999*q[1]+.001*c[1]);return q,dist
records=[]; rows=[];geo=[]
for w in ways:
 p=w['xy'];geom={'type':'LineString' if w['tags']['golf']=='hole' else 'Polygon','coordinates':[[coord(z)['longitude'],coord(z)['latitude']] for z in p]}
 if geom['type']=='Polygon':geom['coordinates']=[geom['coordinates']]
 geo.append({'type':'Feature','properties':{'osmWayId':w['id'],**w['tags'],'osmUpdated':w['timestamp']},'geometry':geom})
for i,h in enumerate(holes):
 p=h['xy']; g=min(greens,key=lambda z:math.dist(centroid(z['xy']),p[-1]));gc=centroid(g['xy']);assert Path(g['xy']).contains_point(p[-1]); assert Path(g['xy']).contains_point(gc)
 reftee=next(t for t in tees if Path(t['xy']).contains_point(p[0]))
 rec={'number':i+1,'greenCentre':coord(gc),'greenGeometryStatus':'centroid_of_osm_polygon_not_field_surveyed','greenOsmWayId':g['id'],'holeOsmWayId':h['id'],'mappedReferenceTee':coord(p[0]),'mappedReferenceTeeOsmWayId':reftee['id'],'mappedReferenceTeeColour':None,'lineToGreen':[coord(z) for z in p],'teeEstimates':{}}
 v=(p[1][0]-p[0][0],p[1][1]-p[0][1]);ln=math.hypot(*v);v=(v[0]/ln,v[1]/ln)
 for colour in ['white','yellow','red']:
  offset=(lengths['white'][i]-lengths[colour][i])*.9144;desired=advance(p,offset)
  candidates=[]
  for t in tees:
   c=centroid(t['xy']);z=(c[0]-p[0][0],c[1]-p[0][1]);along=z[0]*v[0]+z[1]*v[1];cross=abs(z[0]*v[1]-z[1]*v[0])
   if along>=-4 and along<110 and cross<16:
    q,dist=closest(desired,t['xy']);candidates.append((dist,t['id'],q))
  dist,tid,q=min(candidates);assert Path(next(t['xy'] for t in tees if t['id']==tid)).contains_point(q)
  rec['teeEstimates'][colour]={'position':coord(q),'status':'inferred_colour_not_verified','sourceTeeAreaOsmWayId':tid,'scorecardOffsetFromReferenceYards':lengths['white'][i]-lengths[colour][i],'snapToMappedTeeMetres':round(dist,2)}
  rows.append([i+1,colour,coord(q)['latitude'],coord(q)['longitude'],coord(gc)['latitude'],coord(gc)['longitude'],lengths[colour][i],tid,g['id'],'colour_inferred;not_field_verified'])
 records.append(rec)
assert len(set(x['greenOsmWayId'] for x in records))==18
package={'schemaVersion':2,'course':{'id':'chislehurst-golf-club','name':'Chislehurst Golf Club','latitude':51.4111,'longitude':0.0655,'coordinateReference':'approximate_clubhouse','holeCount':18,'coordinateSystem':'WGS84','retrievedDate':'2026-10-18'},'dataQuality':{'status':'prototype_with_estimated_tee_colours','greenCentres':'18 polygon centroids from OpenStreetMap, matched to numbered hole-line endpoints; not surveyed or independently measured','referenceTees':'18 mapped hole-line start points inside mapped tee areas; colours unlabelled','colourSpecificTees':'PROVISIONAL. Assume each mapped start is a white reference, advance by published white-minus-colour yardage along the hole line, then snap to a nearby mapped tee area. This assumption is not verified; colours may share a point. No official tee-marker accuracy is claimed.','gpsPrototypeUsable':True,'teeColoursVerified':False,'independentCoordinateAccuracyMetres':None},'attribution':{'text':'Map data © OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','licence':'ODbL 1.0','licenceUrl':'https://opendatacommons.org/licenses/odbl/1-0/'},'sources':[{'id':'osm','url':'https://www.openstreetmap.org/api/0.6/map?bbox=0.055,51.407,0.070,51.418','provides':'Raw mapped hole lines, tee polygons and green polygons; source object versions retained in GeoJSON'},{'id':'scorecard','url':'https://www.chislehurstgolfclub.co.uk/the_course','provides':'Official website overview scorecard lengths, pars and stroke indexes. Hole-tour page has inconsistent hole-1 lengths; overview used consistently.'},{'id':'ratings','url':'https://stymie.golf/golf-courses/united-kingdom/england/chislehurst/chislehurst-golf-course','provides':'Secondary-source ratings; not independently confirmed'}],'holes':records,'teeSets':[],'missingData':['Verified white/yellow/red colour labels and permanent reference markers for mapped tee areas.','Field verification of map-derived positions; source hole lines date from 2020 and tee/green polygons from 2021.','Primary confirmation of current ratings and sex-specific pars/stroke indexes. Do not use the red colour column as male par automatically.','Female white rating not obtained.','Official hole-tour and overview yardages conflict on hole 1; confirm current scorecard before official scoring.']}
for colour in ['yellow','white','red']:
 profile='female' if colour=='red' else 'male'
 package['teeSets'].append({'id':colour,'colour':colour,'ratings':ratings[colour],'publishedHoleScoringAppliesToSex':profile,'scoringVerification':'colour_column_from_club_website;other_sex_scoring_unverified','holes':[{'number':i+1,'par':(redpar if colour=='red' else pars)[i],'strokeIndex':(redsi if colour=='red' else si)[i],'lengthYards':lengths[colour][i],'tee':h['teeEstimates'][colour]['position'],'teeStatus':'inferred_colour_not_verified','greenCentre':h['greenCentre']} for i,h in enumerate(records)]})
# Confirmed via the course-rating pages linked from the club website.
for ts in package['teeSets']:
 for rating in ts['ratings']:
  supported=(ts['colour'],rating['sex']) in [('white','male'),('yellow','male'),('yellow','female'),('red','female')]
  if supported:
   rating['verification']='club_linked_rating_page'
   rating['par']=69 if rating['sex']=='female' else 66
   rating['sourceUrl']='https://eagleplus.uk.com/c/chislehurst/course-ratings-'+('women/' if rating['sex']=='female' else 'men/')
package['sources'].append({'id':'club_ratings_men','url':'https://eagleplus.uk.com/c/chislehurst/course-ratings-men/','provides':'Club-linked male white/yellow ratings and total par'})
package['sources'].append({'id':'club_ratings_women','url':'https://eagleplus.uk.com/c/chislehurst/course-ratings-women/','provides':'Club-linked female yellow/red ratings and total par'})
package['missingData']=[x for x in package['missingData'] if not x.startswith('Primary confirmation')]
package['missingData'].append('Female yellow total par is confirmed as 69, but the per-hole female yellow par and stroke-index allocation has not been confirmed. The yellow holes array contains the male scorecard. Do not use it for female Stableford without supplying the correct scoring profile.')
package['missingData'].append('Male red rating is secondary-only and is absent from the club-linked male rating page. Disable official male-red Stableford pending club confirmation of rating and hole scoring.')
(OUT/'chislehurst-course.json').write_text(json.dumps(package,indent=2)+'\n')
(OUT/'chislehurst-map-geometry.geojson').write_text(json.dumps({'type':'FeatureCollection','features':geo},indent=2)+'\n')
with (OUT/'chislehurst-coordinates.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['hole','teeColour','teeLatitude','teeLongitude','greenLatitude','greenLongitude','officialLengthYards','teeAreaOsmWayId','greenOsmWayId','status']);w.writerows(rows)
fig,ax=plt.subplots(figsize=(10,12),facecolor='#f7f8f3');ax.set_facecolor('#f7f8f3')
for t in tees:ax.add_patch(Polygon(t['xy'],facecolor='#c4c8ba',edgecolor='#8e9584',linewidth=.4))
for g in greens:ax.add_patch(Polygon(g['xy'],facecolor='#72ab74',edgecolor='#377241',linewidth=.7))
for i,(h,rec) in enumerate(zip(holes,records)):
 xs,ys=zip(*h['xy']);ax.plot(xs,ys,color='#647d84',lw=.9,alpha=.65);a=h['xy'][0];gc=centroid(next(g['xy'] for g in greens if g['id']==rec['greenOsmWayId']));ax.text(gc[0]+4,gc[1]+3,str(i+1),fontsize=10,fontweight='bold',color='#154e2a',bbox={'facecolor':'white','alpha':.7,'edgecolor':'none','pad':1})
 ax.plot(*a,marker='x',color='#25333b',ms=5)
ax.plot([],[],marker='x',color='#25333b',linestyle='none',label='Mapped reference tee (colour unknown)');ax.plot([],[],color='#72ab74',lw=7,label='Mapped greens');ax.plot([],[],color='#c4c8ba',lw=7,label='Mapped tee areas')
ax.set_aspect('equal');ax.autoscale();ax.set_xlabel('Metres east of local reference');ax.set_ylabel('Metres north of local reference');ax.set_title('Chislehurst Golf Club — 18 mapped holes\nNumbers identify greens; lines connect mapped tee references to greens',fontsize=13,pad=15);ax.legend(loc='lower left',fontsize=8);ax.grid(alpha=.15)
fig.text(.5,.02,'Map data © OpenStreetMap contributors (ODbL) • Retrieved 18 October 2026\nMap-derived reference positions, not a surveyed course plan. Tee colours are not recorded in the source.',ha='center',fontsize=8)
fig.tight_layout(rect=[0,.05,1,1]);fig.savefig(OUT/'chislehurst-coordinate-map.png',dpi=160);plt.close(fig)
fig,axs=plt.subplots(6,3,figsize=(15,24),facecolor='#f7f8f3')
for i,(ax,h,rec) in enumerate(zip(axs.flat,holes,records)):
 p=h['xy'];a=p[0];ax.set_facecolor('#f7f8f3')
 for t in tees:
  if math.dist(centroid(t['xy']),a)<125:ax.add_patch(Polygon(t['xy'],facecolor='#d9dfce',edgecolor='#758563',lw=.7))
 xs,ys=zip(*p);ax.plot(xs,ys,color='#9fa9af',lw=1)
 for colour,col,mark in [('white','#ffffff','o'),('yellow','#eab308','s'),('red','#e74c3c','^')]:
  c=rec['teeEstimates'][colour]['position'];q=xy((c['latitude'],c['longitude']));ax.scatter(*q,c=col,edgecolors='#333333',marker=mark,s=42,zorder=5,label=colour)
 ax.scatter(*a,marker='x',c='#000000',s=50,zorder=7,label='reference');ax.set_xlim(a[0]-48,a[0]+48);ax.set_ylim(a[1]-48,a[1]+48);ax.set_aspect('equal');ax.set_title(f'Hole {i+1} — inferred colours',fontsize=10);ax.tick_params(labelsize=7);ax.grid(alpha=.2)
axs.flat[0].legend(fontsize=7,loc='best');fig.suptitle('PROVISIONAL tee positions — colours inferred, not confirmed\nAll coloured points constrained to mapped tee areas; inspect against on-course knowledge.',fontsize=15,y=.99);fig.tight_layout(rect=[0,.02,1,.965]);fig.text(.5,.005,'Map data © OpenStreetMap contributors (ODbL). Axes in local metres. Points can overlap on shared tee areas.',ha='center',fontsize=9);fig.savefig(OUT/'chislehurst-provisional-tee-detail.png',dpi=120);plt.close(fig)
print('Created',len(records),'unique matched greens and reference tees;',len(rows),'provisional coloured tee positions.')
print('Scorecard totals:',{c:sum(v) for c,v in lengths.items()})
print('Max provisional snap distance:',max(e['snapToMappedTeeMetres'] for h in records for e in h['teeEstimates'].values()))
for h in records:print(h['number'],h['mappedReferenceTee'],h['greenCentre'])
