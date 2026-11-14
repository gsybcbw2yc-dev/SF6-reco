const assert=require('node:assert/strict');
const E=require('../web/rating-evidence.js');
const time=(min)=>new Date(Date.parse('2026-11-15T00:00:00Z')+min*60000).toISOString();
const data=[
 {key:'a',character:'AKUMA',phase:'unknown',observed_at:time(0),mr:1379,lp:114555,source:'battlelog_pre_match',rating_basis:'pre_match',time_basis:'buckler_uploaded_at'},
 {key:'b',character:'AKUMA',phase:'unknown',observed_at:time(3),mr:1387,lp:114710,source:'battlelog_pre_match',rating_basis:'pre_match',time_basis:'buckler_uploaded_at'},
 {key:'c',character:'TERRY',phase:'unknown',observed_at:time(18),mr:0,lp:23119,source:'battlelog_pre_match',rating_basis:'pre_match',time_basis:'buckler_uploaded_at'},
 {key:'d',character:'TERRY',phase:'unknown',observed_at:time(40),mr:0,lp:23200,source:'battlelog_pre_match',rating_basis:'pre_match',time_basis:'buckler_uploaded_at'},
 {key:'e',character:'AKUMA',phase:'15',observed_at:time(45),mr:1400,lp:115111,source:'battlelog_pre_match',rating_basis:'pre_match',time_basis:'buckler_uploaded_at'}
];
const archive=E.normalize({schema:1,checked_at:time(60),events:[...data].reverse()});
assert.equal(archive.events.length,5);
assert.equal(archive.checked_at,time(60));
assert.equal(E.latest(archive,'AKUMA').key,'e');
assert.equal(E.latest(archive,'TERRY').key,'d');
assert.equal(E.latest(archive,'すべて'),null);
assert.equal(E.trace(archive,'AKUMA','all',0,'mr').length,3);
assert.equal(E.trace(archive,'TERRY','all',0,'mr').length,0);
assert.equal(E.trace(archive,'TERRY','all',0,'lp').length,2);
assert.equal(E.trace(archive,'AKUMA','unknown',0,'lp').length,2);
assert.equal(E.trace(archive,'すべて','all',Date.parse(time(30)),'lp').length,2);
assert.deepEqual(E.segments(E.trace(archive,'AKUMA','unknown',0,'mr')).map(g=>g.length),[2]);
assert.deepEqual(E.segments(E.trace(archive,'TERRY','all',0,'lp')).map(g=>g.length),[1,1]);
assert.equal(E.segments(E.trace(archive,'すべて','all',0,'lp')).length,4);
const malformed=E.normalize({schema:1,checked_at:'unparseable',events:[
 ...data,{...data[0]},{...data[2],key:'f',source:'periodic_buckler_snapshot'},
 {...data[1],key:'g',rating_basis:'post_match'},
 {...data[1],key:'h',time_basis:'next_scrape'},
 {...data[1],key:'i',observed_at:'invalid'},
 {...data[1],key:'j',mr:null,lp:null},
]});
assert.equal(malformed.events.length,5);
assert.equal(malformed.checked_at,null);
assert.deepEqual(E.normalize(null).events,[]);
assert.equal(E.usable(0,'mr'),false);
assert.equal(E.usable(0,'lp'),true);
console.log('Battle Log evidence: per-character timing, source separation, invalid inputs and gap segmentation passed');
