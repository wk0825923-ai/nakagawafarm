/* 20圃場デモデータ投入（ブックマークレットから読み込む用のツール。アプリ本体からは参照しない）
   使い方: アプリにログインした状態でブックマークレットをクリックするとこのスクリプトが読み込まれ実行される。 */
(async () => {
  let fid = Object.keys(localStorage).find(k => k.startsWith('farm_fields_v2_') || k.startsWith('farm_monthly_temps_'));
  fid = fid ? fid.slice(fid.lastIndexOf('_') + 1) : null;
  if (!fid) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      const { data: m } = await sb.from('farm_members').select('org_id').eq('user_id', user.id).limit(1);
      const { data: fa } = await sb.from('farm_farms').select('id').eq('org_id', m[0].org_id).order('created_at');
      const saved = localStorage.getItem('last_farm_' + m[0].org_id);
      fid = (fa.find(x => x.id === saved) || fa[0]).id;
    } catch (e) { alert('先にログインしてから実行してください'); return; }
  }
  const set = (k, v) => localStorage.setItem(k + '_' + fid, JSON.stringify(v));
  const C = ['#0D9972','#EA580C','#2563EB','#7C3AED','#B45309','#DC2626','#0891B2','#65A30D'];
  const def = [];
  for (let i=0;i<8;i++) def.push({crop:'レタス',cat:'leaf_veg'});
  for (let i=0;i<7;i++) def.push({crop:'とうもろこし',cat:'corn'});
  for (let i=0;i<5;i++) def.push({crop:'米',cat:'rice'});
  const fields = def.map((d,idx)=>({id:idx+1,name:'第'+(idx+1)+'圃場',field_no:String(idx+1),crop:d.crop,area_are:10+((idx+1)%5)*5,color:C[idx%C.length],row_count:12,crop_category:d.cat,status:'栽培中',lat:35.384+(idx%5)*0.004,lng:139.925+Math.floor(idx/5)*0.004}));
  set('farm_fields_v2', fields);
  const lots={},records=[],sprays=[],harvs=[],ferts=[]; let rid=1000,sid=5000,hid=7000,tid=6000;
  fields.forEach(f=>{ lots[f.id]=[];
    if(f.crop==='レタス'){ lots[f.id].push({id:++rid,row_range:'1-4',variety:'シスコ',seed_date:'2025-03-01',transplant_date:'2025-04-01',seedling_period_days:31,status:'harvested'}); lots[f.id].push({id:++rid,row_range:'5-8',variety:'ラプトル',seed_date:'2025-07-25',transplant_date:'2025-08-28',seedling_period_days:34,status:'growing'}); harvs.push({id:++hid,field_id:f.id,date:'2025-06-05',variety:'シスコ',row_range:'1-4',lot_code:'L'+f.id,shipments:[{dest:'朝採りJA',grade:'規格内',unit_type:'count_pcs',cases:40+f.id}],total_cases:40+f.id,note:''}); sprays.push({id:++sid,field_id:f.id,date:'2025-05-10',weather:'晴',row_range:'1-4',pesticides:[{pesticide_id:1,dilution:1000,disposal_amount:0}],spray_volume_L:100,note:''}); ferts.push({id:++tid,field_id:f.id,date:'2025-04-20',fertilizing_type:'元肥',item:'レタス',row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:1,dilution:null,amount_kg:25}],spray_volume_L:null,note:''}); }
    else if(f.crop==='とうもろこし'){ lots[f.id].push({id:++rid,row_range:'1-6',variety:'ゴールドラッシュ',seed_date:'2025-04-15',transplant_date:'2025-05-10',seedling_period_days:25,status:'harvested'}); lots[f.id].push({id:++rid,row_range:'7-12',variety:'おひさまコーン',seed_date:'2025-05-15',transplant_date:'2025-06-05',seedling_period_days:21,status:'ready'}); harvs.push({id:++hid,field_id:f.id,date:'2025-07-20',variety:'ゴールドラッシュ',row_range:'1-6',lot_code:'C'+f.id,shipments:[{dest:'取引先A',grade:'2L',unit_type:'container_count',cases:20+f.id}],total_cases:20+f.id,note:''}); sprays.push({id:++sid,field_id:f.id,date:'2025-06-10',weather:'曇',row_range:'1-6',pesticides:[{pesticide_id:2,dilution:2000,disposal_amount:0}],spray_volume_L:120,note:''}); }
    else { lots[f.id].push({id:++rid,row_range:'1-12',variety:'コシヒカリ',seed_date:'2025-04-10',transplant_date:'2025-05-20',seedling_period_days:40,status:'harvested'}); lots[f.id].push({id:++rid,row_range:'1-6',variety:'秋レタス転換',seed_date:'2025-07-25',transplant_date:'2025-08-28',seedling_period_days:34,status:'growing'}); harvs.push({id:++hid,field_id:f.id,date:'2025-09-25',variety:'コシヒカリ',row_range:'1-12',lot_code:'R'+f.id,shipments:[{dest:'JA',grade:'一等米',unit_type:'count_pcs',cases:30+f.id}],total_cases:30+f.id,note:'稲刈り'}); ferts.push({id:++tid,field_id:f.id,date:'2025-08-30',fertilizing_type:'元肥',item:'レタス',row_range:'1-6',row_count:6,fertilizers:[{fertilizer_id:1,dilution:null,amount_kg:30}],spray_volume_L:null,note:'転換後'}); }
    records.push({id:100000+f.id,date:'2024-05-10',field_id:f.id,work_type:'定植',weather:'晴',worker:'今福',variety:f.crop,rows_worked:4,note:'過去データ',photos:[]});
    records.push({id:200000+f.id,date:'2023-06-15',field_id:f.id,work_type:'農薬散布',weather:'晴',worker:'今福',pesticide_id:1,dilution:1000,amount:0.1,note:'過去'});
  });
  const WT=['畝づくり','定植','農薬散布','施肥','除草','灌水','収穫','点検'], workers=['中川 太郎','佐藤 花子','Nguyen Van A','Li Wei','今福','田中 一郎']; let recId=300000;
  for(let k=0;k<60;k++){ const f=fields[k%fields.length], wt=WT[k%WT.length], mm=String(5+(k%3)).padStart(2,'0'), dd=String(1+(k%27)).padStart(2,'0'); const rec={id:++recId,date:'2026-'+mm+'-'+dd,field_id:f.id,work_type:wt,weather:['晴','曇','雨','晴'][k%4],worker:workers[k%workers.length],note:k%5===0?'順調':'',photos:[]}; if(wt==='農薬散布'){rec.pesticide_id=1+(k%4);rec.dilution=1000;rec.amount=0.1} if(wt==='施肥'){rec.amount=20} if(wt==='定植'){rec.variety=f.crop;rec.rows_worked=4;rec.tray_count=40} records.push(rec); }
  set('farm_lots',lots); set('farm_records',records); set('farm_lot_spray_records',sprays); set('farm_harvest_records',harvs); set('farm_top_dressing_records',ferts);
  set('farm_pesticides',[{id:1,name:'アディオン乳剤',reg_no:'R-18332',max_times:3,preharvest_days:7,dilution:1000},{id:2,name:'ダコニール1000',reg_no:'R-9188',max_times:5,preharvest_days:14,dilution:1000},{id:3,name:'モスピラン顆粒水溶剤',reg_no:'R-20115',max_times:2,preharvest_days:3,dilution:1500},{id:4,name:'アドマイヤー1顆粒',reg_no:'R-19876',max_times:3,preharvest_days:7,dilution:2000},{id:5,name:'プレバソンフロアブル5',reg_no:'R-22011',max_times:2,preharvest_days:1,dilution:2000},{id:6,name:'ジュリボフロアブル',reg_no:'R-24188',max_times:1,preharvest_days:0,dilution:2000}]);
  set('farm_pesticide_stock',[{pesticide_id:1,stock_L:8,alert_threshold_L:2},{pesticide_id:2,stock_L:5,alert_threshold_L:2},{pesticide_id:3,stock_L:1.2,alert_threshold_L:2},{pesticide_id:4,stock_L:6},{pesticide_id:5,stock_L:3},{pesticide_id:6,stock_L:4}]);
  set('farm_pesticide_purchases',[{id:1,pesticide_id:1,amount_L:4,price_yen:8000,supplier:'JA',date:'2026-03-10'},{id:2,pesticide_id:2,amount_L:3,price_yen:6000,supplier:'JA',date:'2026-03-10'},{id:3,pesticide_id:4,amount_L:5,price_yen:9500,supplier:'農協',date:'2026-04-02'},{id:4,pesticide_id:6,amount_L:2,price_yen:7200,supplier:'JA',date:'2026-04-20'}]);
  set('farm_fertilizers',[{id:1,name:'化成肥料888',unit_price_yen_per_kg:90},{id:2,name:'有機配合',unit_price_yen_per_kg:120},{id:3,name:'苦土石灰',unit_price_yen_per_kg:35},{id:4,name:'元気高度リン酸',unit_price_yen_per_kg:150},{id:5,name:'ほう素入り野菜専用482',unit_price_yen_per_kg:180}]);
  set('farm_fertilizer_stock',[{fertilizer_id:1,stock_kg:200},{fertilizer_id:2,stock_kg:150},{fertilizer_id:3,stock_kg:400},{fertilizer_id:4,stock_kg:80},{fertilizer_id:5,stock_kg:60}]);
  set('farm_fertilizer_purchases',[{id:1,fertilizer_id:1,amount_kg:100,price_yen:9000,supplier:'JA',date:'2026-03-15'},{id:2,fertilizer_id:4,amount_kg:40,price_yen:6000,supplier:'農協',date:'2026-04-01'}]);
  set('farm_staff',[{id:1,name:'中川 太郎',name_kana:'ナカガワ タロウ',nationality:'JP',role:'manager',skills:[],avatar:'中'},{id:2,name:'佐藤 花子',name_kana:'サトウ ハナコ',nationality:'JP',role:'worker',skills:[],avatar:'佐'},{id:3,name:'田中 一郎',name_kana:'タナカ イチロウ',nationality:'JP',role:'worker',skills:[],avatar:'田'},{id:4,name:'今福 健',name_kana:'イマフク ケン',nationality:'JP',role:'worker',skills:[],avatar:'今'},{id:5,name:'Nguyen Van A',name_kana:'グエン ヴァン アー',nationality:'VN',role:'trainee',visa_expires_at:'2026-11-30',skills:[],avatar:'Ng'},{id:6,name:'Li Wei',name_kana:'リー ウェイ',nationality:'CN',role:'trainee',visa_expires_at:'2027-03-15',skills:[],avatar:'Li'},{id:7,name:'Santos Maria',name_kana:'サントス マリア',nationality:'PH',role:'trainee',visa_expires_at:'2026-08-20',skills:[],avatar:'Sa'},{id:8,name:'Pham Thi B',name_kana:'ファム ティ ビー',nationality:'VN',role:'trainee',visa_expires_at:'2026-09-10',skills:[],avatar:'Ph'}]);
  const EQ=(typeof EQUIP_LIST!=='undefined')?EQUIP_LIST:['トラクター','スプレーヤー','田植え機','コンバイン','管理機'];
  set('farm_rentals',[0,1,2,3,4,5,6,7,8].map(i=>({id:9000+i,equipment:EQ[i%EQ.length],date:'2026-0'+(6+(i%2))+'-'+String(2+i*3).padStart(2,'0'),type:i%3===0?'rental':'own',note:i%3===0?'近隣農家へ貸出':'自家使用'})));
  // GAP: 物理・書面の管理点は達成済み(is_cleared)、記録系(auto)はデータで自動達成 → ほぼ100%の"満たした状態"デモ
  if(typeof INITIAL_GAP_CHECKS!=='undefined'){ set('farm_gap',INITIAL_GAP_CHECKS.map((c)=>({...c,is_cleared:!c.auto}))); }
  set('farm_maintenance_records',[{id:8001,date:'2026-06-03',machine_name:'トラクター',machine_no:'T-01',mtype:'点検',result:'異常なし',worker:'中川 太郎',note:'エンジンオイル確認'},{id:8002,date:'2026-06-10',machine_name:'スプレーヤー',machine_no:'S-02',mtype:'清掃',result:'対応済',worker:'田中 一郎',note:'ノズル詰まり除去'},{id:8003,date:'2026-06-20',machine_name:'コンバイン',machine_no:'C-01',mtype:'整備',result:'要対応',worker:'今福 健',note:'刃の摩耗・交換手配'},{id:8004,date:'2026-07-01',machine_name:'管理機',machine_no:'K-03',mtype:'点検',result:'異常なし',worker:'佐藤 花子',note:''}]);
  set('farm_shipment_records',[{id:9101,date:'2025-06-10',variety:'シスコ',dest:'朝採りJA',cases:60,harvest_date:'2025-06-05',note:'朝出し'},{id:9102,date:'2025-06-12',variety:'シスコ',dest:'取引先A',cases:40,harvest_date:'2025-06-05',note:''},{id:9103,date:'2025-07-25',variety:'ゴールドラッシュ',dest:'房の駅',cases:30,harvest_date:'2025-07-20',note:'直売'}]);
  set('farm_monthly_temps',[1,2,6,12,17,21,25,26,21,15,9,3]);
  try { alert('✅ 20圃場デモデータを投入しました。OKで表示します。'); } catch (e) {}
  location.href = location.origin + location.pathname;
})();
