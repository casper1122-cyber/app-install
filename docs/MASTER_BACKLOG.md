# 唯一完整待辦總表：需求反向稽核

更新日期：2026-10-26。**本檔是唯一現行待辦／驗收總表**；其他交接文件保留為歷史來源，不再各自維護完成勾選。子編號只供追蹤，不刪除、合併或重新編排原1–16。原16大項目前均未取得整項驗收證據，故不標完成。

## 稽核邊界與版本

已讀完整交接包README、65檔案盤點、完整交接／三份待辦／實證盤點、程式候選與測試；已檢視全部10張原始PNG，重讀image(3)–image(6)提醒事項及image.png原對話進度列。盤點SHA皆核對吻合。**沒有Claude完整逐字對話匯出**；分享頁被代理CONNECT 403，未讀到，不宣稱所有歷史承諾已完整尋回。

- GitHub main最後核對為`9f3039298028f00314b17e0652a5f50dfefe1163`；原分支`work/evidence-quality-gate-20261026`為`333ff63a38da28735f1f1a5786948f3e7482593d`，僅3個獨立測試檔。
- 目前本輪開發在`test-evidence-quality-20261026`。已取得使用者中央54n App／核心並釘住雜湊，舊「缺最新54n」敘述已過時。
- 後台2026.10.26a第18版：有使用者部署版本截圖；14項離線安全測試，不等於線上排程實測完成。
- 54o：使用者回報已上測試並提供實際頁面，發現首頁全未知的回歸；54p：32項離線檢查通過、已上GitHub，尚未收到使用者部署確認。
- 54q：個股來源辨識研究修正，僅本機產生與測試，尚未整合全部金融評級入口，**不可部署**。沒有由助手發布正式App的證據，也不推定正式站現時版本。

## 證據判讀（不是完成百分比）

- 靜態存在：只表示找到程式，不能標完成。
- 離線測試通過：具體測試路徑／行為成立；fixtures不代表真實市場、GAS或手機已通過。
- 使用者操作／截圖：只證明該畫面及當時行為，不外推完整功能。
- 整項完成：必須所有子需求、實際功能驗收及必要研究／樣本外證據齊全；本表不以舊助手口頭宣稱替代。

## 來源與測試索引

|代號|來源／證據|限制|
|---|---|---|
|S1|完整包原始檔image(3)～image(6)，提醒事項1–16|已直接看圖；14後半明確省略；6已補回可見完整段，不能證明沒有額外隱藏備註|
|S2|Codex_app-install_完整交接_2026-10-26.md；交接待辦、總表V2、依截圖總表、實證盤點|二手交接摘要，不等同完整逐字對話|
|S3|完整包image.png右側原Claude進度列及對話文字|僅可見行，不能將進度列視為已交付|
|S4|本對話使用者「補充開發決策與交接指令」及「需求反向稽核」；[持久化決策摘要](audit/DECISIONS_2026-10-26.md)|最新明確要求；與舊規則有差異時明列，不默默改算法|
|E1|[App回歸](../tests/gas/regression.cjs)：22項通過|fixtures／實際函式；不是GAS或市場回測|
|E2|[覆蓋率與渲染](../tests/gas/coverage-panel.test.cjs)：10項通過|保留結果／圖表字串與範圍；Chromium截圖逾時，無手機視覺驗收|
|E3|[個股資料來源](../tests/gas/provenance.test.cjs)：8項通過|54q研究修正；僅ownOnly入口防代理，預設組合及長期代理尚未全處理|
|E4|[發布閘門](../tests/gas/release-gate.test.cjs)：14項通過|真後台來源＋Google API mock，未實際發布|
|E5|[更新程式安全](../tests/updater/test_publish_safety.py)：8 tests通過|阻擋新補零／誤報，未執行Windows排程／真資料更新或清洗歷史既有零|
|E6|[完整包盤點](handoff/full-package-inventory.json)、[歷史接手紀錄](handoff/2026-10-26.md)|來源指紋與歷史狀態，不是功能驗收|

以下程式連結固定指向54p候選，屬可核對位置，不冒充線上現行來源。研究修正另連至工具／測試。

## 原始待辦1–16（全部保留）
### 1. 評分標準重做（照信用評等邏輯，先看起點機率表）

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|1.1 保留AAA～CCC十三級與各級門檻|[rateLetter](../tools/gas/candidates/central-54p-test/App.html#L9476)；[rateGrade](../tools/gas/candidates/central-54p-test/App.html#L9501)|靜態有實作|E1只覆蓋原七方案運算，未驗證經濟意義|補各門檻來源、置信範圍與樣本外驗證|S1、S4|
|1.2 先看起點機率表；重大損失機率與後續十年實質預期損失的定義版本|[elCalc](../tools/gas/candidates/central-54p-test/App.html#L10391)；[rateElScore](../tools/gas/candidates/central-54p-test/App.html#L9543)；[rateHowGuide](../tools/gas/candidates/central-54p-test/App.html#L10002)|需求版本待釐清|S1與S2／S4描述不完全一致；非同一指標|保留現有規則，不自行選新標準；核實原決策後定驗收|S1、S2、S4|
|1.3 各因素照影響比例；凶宅價格已反映時只算流動性，避免重算|[reElBuild](../tools/gas/candidates/central-54p-test/App.html#L10450)；[assetRE](../tools/gas/candidates/central-54p-test/App.html#L10232)|靜態有部分對應|房產新函式在54p與54n比對保留；未做因素重複計價測試|逐項參數及價格／流動性拆分測試，不能稱整項完成|S1|

### 2. 新手推薦配置＋年紀避險＋大跌保護

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|2.1 以使用者金額詢問大跌反應；新手推薦流程|[openReco](../tools/gas/candidates/central-54p-test/App.html#L12314)；[recoStep](../tools/gas/candidates/central-54p-test/App.html#L12355)；[waSaveReco](../tools/gas/candidates/central-54p-test/核心.gs#L1625)|局部離線通過|E1有缺年齡入口；未測完整新帳戶／實際寫入|用匿名測試帳戶走完整問卷及儲存／重開|S1、S4|
|2.2 必要年齡、退休年帶入；既有帳戶逐步補齊不重置|[recoYears](../tools/gas/candidates/central-54p-test/App.html#L12252)；[recoAgeStep](../tools/gas/candidates/central-54p-test/App.html#L12321)；[waRetireBasic](../tools/gas/candidates/central-54p-test/核心.gs#L1613)|局部離線通過|E1有缺值、未來出生年、有效年齡檢查|確認真實回報未詢問的進入路徑、伺服器預設及舊帳戶遷移|S1、S4|
|2.3 固定開銷自動算、5年大額支出及緊急預備金|[assetMonthNeed](../tools/gas/candidates/central-54p-test/App.html#L10836)；[recoCompute](../tools/gas/candidates/central-54p-test/App.html#L12291)|靜態與局部離線|E1驗證100萬／5萬月支出／20萬大支出可產生50%現金，不是該使用者根因|核對使用者實際輸入；不得任意調低；研究門檻適用性|S1、S4|
|2.4 年齡下滑、七個預設也套年齡、退休轉保守及大跌保護|[recoGlide](../tools/gas/candidates/central-54p-test/App.html#L12245)；[recoPresetAged](../tools/gas/candidates/central-54p-test/App.html#L12277)；[recoMonthly](../tools/gas/candidates/central-54p-test/App.html#L12438)；[trendSignal](../tools/gas/candidates/central-54p-test/App.html#L12473)|靜態有實作|未重現樣本外台灣測試；七方案可算不代表此政策已驗證|補年齡路徑與保護策略的時間留出、成本及基準比較|S1、D11|

### 3. 改比例照風險相近先扣＋買個股跳窗

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|3.1 改比例從風險相近項目扣；合計100%；現金最低5%|[openRateLab](../tools/gas/candidates/central-54p-test/App.html#L11621)；[recoRound](../tools/gas/candidates/central-54p-test/App.html#L12284)；[waSaveTargets](../tools/gas/candidates/central-54p-test/核心.gs#L585)|靜態有實作|未執行完整比例編輯／超額／稅費寫入驗證|邊界、四捨五入、鎖住持倉與黃金／自選股交疊測試|S1|
|3.2 沒有個股比例時，買個股先跳窗|[stockTargetAsk](../tools/gas/candidates/central-54p-test/App.html#L7794)；[waApplyMix](../tools/gas/candidates/central-54p-test/核心.gs#L904)|靜態有對應函式|沒有實際下單前流程測試|匿名帳戶驗證只改目標不擅自交易；買入取消路徑|S1|

### 4. 設定選單整理成7個資料夾＋期初補登＋舊帳號＋更新引導

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|4.1 七個設定資料夾；期初補登；舊帳戶引導與缺項紅點|[menuFolders](../tools/gas/candidates/central-54p-test/App.html#L9163)；[openSettingsFolder](../tools/gas/candidates/central-54p-test/App.html#L9217)；[openingAsk](../tools/gas/candidates/central-54p-test/App.html#L5200)；[openOpeningFix](../tools/gas/candidates/central-54p-test/App.html#L5159)|靜態有實作|沒有新舊帳戶完整UI／持久化驗證|逐一核對七組名稱、舊資料不重置、補齊後紅點消除|S1、S4|
|4.2 這次更新了什麼引導；測速移後台|[chgCheck](../tools/gas/candidates/central-54p-test/App.html#L984)；[openChangelog](../tools/gas/candidates/central-54p-test/App.html#L998)；[perfBlock](../tools/gas/candidates/central-54p-test/App.html#L1110)|靜態有部分對應|有函式不證明測速已完全移走|對照各入口與版本更新顯示；測速位置需實測|S1|
|4.3 期初登記不算資產增長|[waSetOpening](../tools/gas/candidates/central-54p-test/核心.gs#L9989)；[waEstimateSnapshot](../tools/gas/candidates/central-54p-test/核心.gs#L2093)；[waNetReturn_](../tools/gas/candidates/central-54p-test/核心.gs#L2172)|靜態有實作|無期初補登前後淨資產／損益不變量回歸|補跨日期、多資產、撤銷及成本／現金一致性測試|S1|

### 5. 資產分布每類各自一塊

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|5.1 棒球卡、藝術品等資產分布每類各自一塊|[pieCard](../tools/gas/candidates/central-54p-test/App.html#L1600)；[altKind](../tools/gas/candidates/central-54p-test/App.html#L2060)；[altCard](../tools/gas/candidates/central-54p-test/App.html#L2081)|靜態有實作|未完成手機及多分類圖例驗證|實際測試分類、金額與總額一致；不可重複計入|S1|

### 6. 保險照類型分表單＋名稱自動判斷＋保險評級細項

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|6.1 保險按儲蓄／終身／投資型／年金／純保障分表單|[polTypeOf](../tools/gas/candidates/central-54p-test/App.html#L2024)；[openAlt](../tools/gas/candidates/central-54p-test/App.html#L2103)；[waAltPolSave_](../tools/gas/candidates/central-54p-test/核心.gs#L2846)|靜態有實作|S1 image(4)可補回可見完整類型清單，未端到端驗收|逐類輸入、修改、儲存再讀；純保障不當資產|S1第6備註|
|6.2 名稱自動判斷；研究壽險公會商品資料庫|[polGuess](../tools/gas/candidates/central-54p-test/App.html#L2015)|靜態有部分實作|沒有商品資料庫合法資料介接及辨識準確率證據|建立來源／授權／有效期，人工確認歧義，不猜保證收益|S1第6備註|
|6.3 解約損失表；與定存＋定期險比較；分紅不保證|[polBreakEven](../tools/gas/candidates/central-54p-test/App.html#L2033)；[polGuar](../tools/gas/candidates/central-54p-test/App.html#L2026)；[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)|靜態有部分實作|未找到完整替代方案比較驗收；未獨立校準1.75%等預設|補保證／宣告分開、解約曲線與替代方案含費比較|S1第6備註、D9|

### 7. 房地產填資料整併成4步

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|7.1 房地產表單四步：基本→條件→出租費用→格局圖|[reEditBase](../tools/gas/candidates/central-54p-test/App.html#L5093)；[reEditCosts](../tools/gas/candidates/central-54p-test/App.html#L5474)；[reEditRoom](../tools/gas/candidates/central-54p-test/App.html#L5495)|靜態有相鄰流程|未測四步串接、返回與草稿保留|按房型測試必填與可略過問題；禁止漏存／重置|S1|
|7.2 題目依住宅、店面、土地等類型切換|[assetRE](../tools/gas/candidates/central-54p-test/App.html#L10232)；[openRE](../tools/gas/candidates/central-54p-test/App.html#L2905)|靜態有實作|未完整驗證各類型條件及估值分支|建立類型表單與參數適用範圍矩陣|S1|

### 8. 金融配置補5樣

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|8.1 看穿持股集中度：ETF交疊與單一個股|[rateCurrent](../tools/gas/candidates/central-54p-test/App.html#L9771)；[assetHealth](../tools/gas/candidates/central-54p-test/App.html#L10942)|靜態有部分實作|未驗證ETF成分穿透；單股比例提示不等於完整穿透|同時持0050與台積電等案例，來源日期及避免重複|S1、S4|
|8.2 股利健保補充保費與美股扣稅|[costAnnual](../tools/gas/candidates/central-54p-test/App.html#L9590)；[costPlan](../tools/gas/candidates/central-54p-test/App.html#L9576)；[rateRun](../tools/gas/candidates/central-54p-test/App.html#L9293)|靜態有成本相關碼|沒有稅制生效日期、門檻與個人條件完整測試|逐一核對法規與現金流，避免已扣稅資料再扣|S1|
|8.3 ETF品質、退休模擬與估值參考|[rateGrade](../tools/gas/candidates/central-54p-test/App.html#L9501)；[retireSim](../tools/gas/candidates/central-54p-test/App.html#L1858)；[rsimRun_](../tools/gas/candidates/central-54p-test/App.html#L1817)；[rateGapText](../tools/gas/candidates/central-54p-test/App.html#L11577)|靜態有部分實作|沒有整套ETF品質來源、退休／估值實證驗收|費用、追蹤差異、稅、流動性及完整資產／情境校準|S1、S4|

### 9. 個股改用真實資料評級

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|9.1 個股使用自己的真實歷史與模型，不以大盤冒充|[rateDataWith](../tools/gas/candidates/central-54p-test/App.html#L9685)；[assetFin](../tools/gas/candidates/central-54p-test/App.html#L10815)；[stk_build.py](../tools/stk/stk_build.py)|缺陷已定位；研究修正未發布|E3新增8項驗證單檔ownOnly缺值不以代理填；組合預設仍用代理|整合預設組合、長期代理及介面標示，不得宣布全修好|S1、S4|
|9.2 個股風險參數、含下市樣本及樣本外回測|[model.py](../tools/stk/model.py)；[cv.py](../tools/stk/cv.py)；[hist.json](../stk/hist.json)|有程式與自報指標，未獨立驗證|model.auc=0.815為檔內宣告；model.src為不完整文字「實價…」|補精確來源、訓練與測試日期、下市處理、可重跑證據|S1、D12|

### 10. 資產門檻提醒＋調整報告（3000萬／1億／10億）

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|10.1 3000萬／1億／10億資產門檻提醒|[assetAlerts](../tools/gas/candidates/central-54p-test/App.html#L11048)；[homeAlertHtml](../tools/gas/candidates/central-54p-test/App.html#L11064)|未找到三門檻完整對應驗收|現有嚴重風險提示不等於資產級距提醒|定義跨門檻觸發、去重、歷史及不擾民規則|S1|
|10.2 調整報告：賣什麼、買什麼、手續費稅、建議房子、圖表在上|[rateAdvice](../tools/gas/candidates/central-54p-test/App.html#L9811)；[reReport](../tools/gas/candidates/central-54p-test/App.html#L4932)；[buildCombinedReportV4_](../tools/gas/candidates/central-54p-test/核心.gs#L7411)|靜態有局部報告|未找到符合全部子項的整合報告證據|維持真持倉與建議分開；成本、流動性、來源與視覺驗收|S1、S4|

### 11. 「買之前評一下」獨立頁面

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|11.1 獨立「買之前評一下」頁；不影響真持倉|[openRateLab](../tools/gas/candidates/central-54p-test/App.html#L11621)；[openAsset](../tools/gas/candidates/central-54p-test/App.html#L11409)|未找到獨立頁完整驗收|現有試配／評級入口不等於獨立購前評估|設獨立輸入生命週期與不寫帳務測試；多資產適用|S1、S4|

### 12. 球員卡詳細評級＋小幫手更新

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|12.1 逐卡十指標與原13級：不得共用品類假設參數|[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)；[assetSheetHtml](../tools/gas/candidates/central-54p-test/App.html#L11094)|防誤評局部離線通過；完整模型未完成|E1僅驗證不虛構CCC／損失；沒有真實逐卡樣本外回測|卡片身份、球員／系列／鑑定／稀缺／成交／成本／流動性／真偽風險模型|S1、S4|
|12.2 名人堂標準／WAR／JAWS／里程碑；新人10年推估|[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)；[registry.json](../data/registry.json)|尚未找到經驗證模型|war/lahman狀態later；不能以WAR固定係數換卡價|合法來源、年代與球員分群、防選擇偏誤、時間留出|S1、S4|
|12.3 小幫手更新與易用性；最終改App內建自動查價|[cardGo](../tools/gas/candidates/central-54p-test/App.html#L2273)；[cardAutoApply](../tools/gas/candidates/central-54p-test/App.html#L2470)；[cardPriceDaily_](../tools/gas/candidates/central-54p-test/核心.gs#L2967)|有舊擴充橋接；內建完整查價未完成|v2.8是候選，未真Chrome／130point驗證；小幫手只查持有卡|不再要求一般用戶裝擴充；研究合法穩定後端成交來源|S1、S4|

### 13. 天災風險自動查

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|13.1 天災風險自動查政府圖資|[assetRE](../tools/gas/candidates/central-54p-test/App.html#L10232)；[prog.py](../tools/prog.py)；[registry.json](../data/registry.json)|有政府資料作業，非完整風險覆蓋證據|govmeta早期0成功誤報已修程式；尚未部署來源作業|淹水／液化／斷層來源、坐標、版本、缺資料狀態及地域驗證|S1、D7|

### 14. 資產回測細到地段＋其他資產也算漲跌

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|14.1 股票ETF黃金外幣照價格；現金定存；車折舊；保險保證收益＋匯率|[allBacktest](../tools/gas/candidates/central-54p-test/App.html#L11131)；[allBacktestHtml](../tools/gas/candidates/central-54p-test/App.html#L11208)；[histVehDerive_](../tools/gas/candidates/central-54p-test/核心.gs#L13274)|舊紀錄自述已做53i；未完整驗收|E2僅檢查圖表函式輸出保留，非歷史數字正確|逐資產來源、費用、缺值／代理與真0區分；不得硬畫精準曲線|S1第14備註|
|14.2 101S3起57季→行政區＋屋齡／類型／樓層；2012前接信義|[load.py](../tools/hpid/load.py)；[idx.py](../tools/hpid/idx.py)；[README.md](../tools/hpid/README.md)；[hpid.json](../re/hpid.json)|有資料與演算碼，未本輪重跑實證|狀態回報57季；README要求信義／重複交易／分組中位數三種核對|保存三類當期結果、時段外資料與資料版本，不能以檔存在當通過|S1第14備註、D1–D4|
|14.3 已確定利多：捷運、重劃區……後續備註|[reElBuild](../tools/gas/candidates/central-54p-test/App.html#L10450)；[renewCalc](../tools/gas/candidates/central-54p-test/App.html#L10172)|來源備註截斷|image(5)、image(6)均有省略號；沒有後半原文|保留已知詞句，尋回展開原文；不自行補承諾或標完成|S1第14備註|

### 15. 都更階段填寫＋估價

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|15.1 都更四階段及條件：洽談／談好／動工／完工；分回坪數樓層車位找補|[renewCalc](../tools/gas/candidates/central-54p-test/App.html#L10172)；[assetRE](../tools/gas/candidates/central-54p-test/App.html#L10232)|靜態有部分計算|未逐階段對照表單與資金流測試|具體合約條件、負債、找補及階段遷移驗證|S1|
|15.2 階段完成機率、剩餘年數、施工租金與房貸；台灣實際成功率年數研究|[renewCalc](../tools/gas/candidates/central-54p-test/App.html#L10172)；[reElBuild](../tools/gas/candidates/central-54p-test/App.html#L10450)；[registry.json](../data/registry.json)|有參數，不等於研究完成|未找到全台分縣市樣本外報告|來源母體與右截尾／失敗案、時段外、區域適用性、不重算已反映價格|S1、D5|

### 16. 收藏品用過去漲幅＋話題性保守估計漲跌

**整項狀態：未驗收完成。**

|子任務／原始需求|程式位置|實際程度|測試／回測證據|尚未完成或遺漏|來源|
|---|---|---|---|---|---|
|16.1 收藏品真實成交估漲跌；依名人堂新人卡／PSA分組；2021後大跌|[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)|完整模型未完成|停用無證據品類評級僅防誤導；無市場資料庫／外樣本結果|建立普遍市場樣本而非持有卡樣本，成本／流動性與偏誤校正|S1、S4|
|16.2 名人堂、紀錄、退休話題事件漲跌分開估並保守折算|[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)|尚未找到實證模型|沒有可重現事件研究／反事實基準證據|事件窗口、對照母體、前視偏誤與不確定性，不直接指定折扣|S1|
|16.3 藝術品拍賣指數文獻；先討論方法|[assetAlt](../tools/gas/candidates/central-54p-test/App.html#L10756)|尚未完成研究與方法確認|目前同樣停用共用品類固定參數，不是藝術估值模型|指數選擇／重複拍賣偏差／費用／區域適用性及確認方法|S1|

## 17、18及截斷原文（保留，不推測名稱）

|原編號／來源|已知內容|缺口與動作|
|---|---|---|
|6備註|image(4)可讀：五種類型、壽險公會資料庫、解約損失表、定存＋定期險比較、分紅不保證|已回填6.1–6.3；若另有未展開備註仍待原文，不聲稱全歷史已齊|
|14備註|image(5)、image(6)截至「已確定利多（捷運、重劃區）…」|後半未找到；保留14.3，不自行補字|
|17|沒有可核實原文|待尋回；不命名、不合併、不標完成|
|18|沒有可核實原文|待尋回；不命名、不合併、不標完成|

## 原資料細化D1–D13（保留原子清單，不取代1–16）

來源均為S2《交接總表V2》的Claude對話補充；下表是原子清單，不把D1當成主待辦1已完成。舊助手自報數字屬待核實聲稱。

|原子編號／需求|關聯原待辦|程式位置|實際程度與證據|未完成／驗收缺口|
|---|---|---|---|---|
|D1 房屋約20細項參數校準|1、14|App `reElBuild`；tools/hpid/rs_feat2.py、mrt_rs.py、land_rs.py|有研究碼／參數；54n新增地段土地內容已保留，非本輪重做研究|逐因子來源、母體、係數、不確定性、時間留出與基準比較；缺捷運等資料需列覆蓋|
|D2 房屋約50組分數刻度|1、14|App `assetRE`、`rateLerp_`|有刻度，無全組實證驗收|逐組檢查屋齡樓層坪數管理車位距離；刻度不是自帶證據|
|D3 約150項估價加減項|7、14|App `reAdjEdit`、`reReport`；核心 `reCalc_`|有估價流程，無150項完整驗收|可由成交估的重算；漏水凶宅海砂景觀等文獻來源與缺口；不得雙重計價|
|D4 租金報酬率分行政區房型|14|tools/hpid/yld_build.py；re/hpid.json `yld`|有輸出與租賃57季狀態回報，不等於租金模型驗證|原始租賃清理、費用空置、抽樣誤差、跨期驗證|
|D5 各縣市都更完成機率及年數|15|App `renewCalc`；registry政府核定資料|有地方來源候選，未證實全國完成率模型|不得把台北推全國；失敗與右截尾案件、期間及條件差異|
|D6 桃中南高周邊新大樓行情|14、15|re/hpid.json `newUnit`；tools/hpid/newunit4.py|Claude聲稱桃園985建案、誤差11.6%→9.1%，未獨立重跑|完整包缺同名「網站_桃園新大樓.zip」，不能以網站_桃園.zip冒充；地域11縣市限制需查碼與實測|
|D7 地段全台與天災圖資|13、14|rawdata/gov；tools/hpid/poi_build.py|部分設施資料，不能推定全台地址距離功能已上線|來源20/20尚無證據；扣地段混淆、時段外及跨縣市驗證後才採用|
|D8 全品牌汽車折舊大規模測試|14及後續收藏車|App `assetVeh`；核心 `reVehCurve_`、`reVehVal_`|有曲線及車款表，無大規模重跑證據|品牌／年份／里程留出、轉售成本與誤差；一般車與收藏車分開|
|D9 保險預設1.75%校準|6|App `assetAlt`、`polGuar`|預設存在，非逐保單保證值|壽險公會與實際契約來源、保證／宣告拆分；缺值不可冒充真值|
|D10 現金／家庭健康門檻台灣驗證|2、1|App `assetCash`、`assetHealth`|有6月等規則，無台灣研究驗收|支出母體、借款壓力／緊急金、合理情境與敏感度|
|D11 年齡下滑與大跌保護台灣回測|2|App `recoGlide`、`trendSeries`；核心 `trendDaily_`|可運算，E1非投資績效驗證|滾動時間留出、成本、比較基準、不同退休期及極端市況|
|D12 金融配置8指標刻度重校|1、8、9|App `rateScores_`、`rateGrade`；tools/stk|有刻度／歷史檔，不等於重校完成|時間分割、代理資料比例、獨立來源與模型選擇偏誤|
|D13 收藏品先取真實成交|12、16|App卡片橋接；交接card_backtest.py|僅持有卡查價與離線baseline候選|普遍市場資料、合法授權、同卡身份與PSA分組、成交非掛價；無資料不停止研究也不假評級|

## 待辦遺漏補充（獨立編號，不冒充原17、18）

這些項目來源在討論、截圖進度列或後續明確決策中，原1–16未完整列明。相關原編號僅供交叉追蹤，不合併既有工單。不把「有函式」或「Claude進度列」當成驗收。

|補充ID／原始需求與子任務|對應原編號|程式位置|實際程度|測試／回測證據|未完成／下一個驗收|來源|
|---|---|---|---|---|---|---|
|補01 全流程低維護自動化：更新、清理、估值、研究、回測、分析、報告；不用開電腦|跨1–16|tools/prog.py；核心觸發器／cardPriceDaily_；後台|桌面Windows作業仍在，非全伺服器自動化|E5只驗發布安全；無無人值守長期作業證據|列作業清單、依賴、排程、來源、快取、失敗重試及最後成功時間；先調研可部署平台|S4§一、九
|補02 合法安全銀行／券商授權可選；不能作使用前提，不擅自交易|8、帳務|未找到完整銀行授權介接|可選後續研究，不阻塞核心App|無實際授權／銀行交易驗收|授權範圍、撤銷、只讀、同步與去重；不得索取聊天密碼|S4§一
|補03 參數證據登錄：來源、公式、母體、期間、版本、品質、OOS、誤差及基準|1、6、8、9、12–16|tests/evidence-quality；各模型程式|有獨立結構gate，未覆蓋全部參數／未真實驗證|原fixture可通過不等於經驗證；E1–E5非市場證據|建立逐參數清冊與可重跑研究報告；模擬／真實標記分開|S4§二
|補04 缺資料覆蓋率、模型可信度與不確定性，不用分數反推損失|1、12、16|App assetAll、assetCoverageHtml、rateScoreEl|54p有覆蓋UI；一般總評仍有score→EL fallback及主觀相關係數|E2通過10項；未證明完整總評合規|盤點所有fallback、採真EL及明確未知範圍；不永久以資料不足代替研究|S4§四
|補05 評級隨資產／資料變動重算，保留月度歷史|1、9、12|App rateHistSave、rateLoadLatest；核心 waRateSnap|有實作；未知評級不入快照已加局部測試|E1未知快照無寫入；無真GAS月份切換驗證|跨月、重試去重、模型版本與歷史可比性|S2完整交接§三
|補06 只重大風險提醒，避免大量低分通知|1、10|App assetAlerts、homeAlertHtml|有去重與提示碼，未驗證通知政策|無完整實際通知測試|變更後何時再通知、缺資料不當重大風險，保留嚴重風險|S2完整交接§三、S4§五
|補07 首頁淨資產線、配置甜甜圈、月收支結餘及重大變化|5、10|App growthChart、pieCard、renderHome、renderData|部分圖表靜態存在；不能全部打勾|E2只驗部分回測輸出保留|逐圖資料口徑、月份及手機互動；月收支圖尚無完整驗收|S4§五
|補08 各資產與報告專屬圖表、來源日期、公式、誤差；不硬畫曲線|6、8、10、12、14–16|App reReport、altChart、retireSimHtml、allBacktestHtml|有個別圖表；未整體驗收|Chromium screenshot未成功；無真實端到端或數據校對|保險替代比較、卡價量與區間、持有成本、建議前後圖表及色彩／手機可讀性|S4§五
|補09 每天09:00只發合格版本；內容核准失效與保留正式版|跨全部|tools/gas/release-gate.gs；後台候選|已寫並離線驗14項；使用者截圖顯示後台26a第18版|E4；尚無真排程未核准阻擋／核准成功的線上證據|驗證真排程狀態、核准內容、失敗保留；不以版本畫面當全驗收|S4§六；本對話後台部署
|補10 減少反覆下載／上傳：安全自動上測試與合格發布|跨全部|後台upload_、selfUpdate_；目前仍由人上傳|現行流程尚需每次選檔，不符最終自動化|沒有可用助手GAS編輯／部署connector證據|設計授權與機器可驗的測試／提交指紋門檻；不拿未驗證模型自動核准|S4§六、九
|補11 Google503、資料健康、失敗原因與最後成功時間|13、維運|admin/index.html api／data頁；核心healthRun_；data/status.json|有狀態UI；舊畫面503尚未定位；govmeta0成功修程式未部署|E5政府失敗mock通過；無真作業恢復測試|區分Google暫故、權限／部署、來源失效；估計／缺值／成功不能混用|S2；S3後台截圖
|補12 生意紀錄可修改、刪除|無完整原編號；關聯帳務|App openBizEdit；核心waBizEditRecord|靜態存在，尚未重新驗收|無匿名GAS帳務不變量／撤銷驗證|收入、進貨、庫存、帳戶、成本、刪除關聯同步及重試去重|S3進度列「生意紀錄可修改刪除＋App加速」
|補13 App加速、載入與同步效能|4相關但獨立承諾|App rawCall、bgRefresh、sqRun、perfBlock|有快取／同步碼，沒有可比量測|無真裝置前後延遲與帳務一致性證據|冷啟動、背景更新、網路慢／斷線，不能為速度漏資料|S3同一進度列
|補14 找台股、美股、黃金歷史；回測幾種策略並回報|8、9、14|tools/prog.py h_rate；App rateRun／trendSignal|有資料及回測碼；無該承諾完整策略報告|E5是安全；資料file內指標僅自報|明列策略／成本／時段留出與比較，不能用模擬冒充市場|S3三條進度列
|補15 伺服器每日自動健檢，測試並交付|無原編號|核心healthDaily_、healthRun_、waHealthRun|有伺服器碼，未真排程驗證|無至少一輪自動執行與錯誤恢復紀錄|實際觸發器、用戶隔離、權限、健康測量與失敗通知|S3「寫每日自動健檢（伺服器端）」「測試健檢並交付」
|補16 App顯示健檢結果及「現在檢查」按鈕|無原編號|App openHealth、healthSummary；核心waHealthData_、waHealthRun|靜態有對應|沒有按鈕成功／錯誤／最新時間的線上驗收|測即時檢查、進行狀態、後端錯誤、最終結果及手機顯示|S3「App顯示健檢結果『現在檢查』按鈕」
|補17 同一筆生意消費合併顯示，點開看明細|無原編號|App openBizGroup；核心waBizHistory|有分組歷史碼，未驗收|無多品項／多付款拆分與去重測試|保留每一明細及對帳總額；合併不丟交易標識|S3原進度列
|補18 客人頁顯示買過商品、做過療程|無原編號|App openCustomer；核心bizCustomers_、waBizQuery|有客戶頁碼，未證明列出所有種類歷史|無真匿名客戶歷史案例|商品／服務／療程／儲值、退貨、隱私及查詢範圍|S3原進度列
|補19 生意送出／修改／刪除後畫面立即更新；測試修改交付|無原編號|App bizEditSend、histEditBind、bizLocalAdd；核心waBizEditRecord|有局部更新碼，未端到端驗收|無成功／失敗回復及連點去重證據|樂觀更新與伺服器回覆一致；庫存、客戶、帳戶、歷史同步|S3兩條原進度列
|補20 外幣刷卡伺服器端處理|無原編號|核心waCcFxOf_、fxLedgerPrep_、fxLedgerApply_、fxLedgerUndo_|有外幣帳務碼，不等於功能驗收|無實際帳單、匯率、退款與對帳測試|交易幣／結帳幣／帳戶幣、手續費、匯率日期、取消還原及不重複扣款|S3「外幣刷卡：伺服器端」
|補21 已有持倉與未來目標分開，不改原帳戶／持倉|2、3、11|App openMyAlloc、rateCurrent、openTargets；核心waApplyMix|有目標／持倉結構，無完整不變量驗證|用戶原話「還是舊的，之後回檔才買」證明情境，非功能通過|建議、試配、儲存目標及實際交易四者區分；既有資料不可重置|S3對話正文；S4§四
|補22 僅管理者安裝一次、一般用戶不裝ZIP／小幫手|12相關|舊Chrome v2.7／v2.8候選與App卡橋接|長期無擴充方案未完成|無內建查價合法可用服務實測|舊「重新載入小幫手」只保留為歷史維修提醒，不作新用戶前提|S4§三，S1獨立提醒
|補23 收藏車／藝術品／音樂專用評級、美股持倉追蹤|16相關但範圍不同|App assetVeh／assetAlt／assetFin；核心其他資產|後續研究未驗收，不能與通用收藏品視為同一已完成功能|無專用模型實證或美股完整帳務驗證|保留各自需求與研究範圍；不因原16提藝術品就合併標完成|S1 image(5)獨立「之後再做」
|補24 富果金鑰、即時價格、每日16點桌面更新、10/28信義提醒|無原編號；關聯維運與14|核心行情；tools/prog.py；後台資料頁|歷史提醒，不推定已做／已過期|沒有即時來源時間、Windows排程或信義實際下載證據|先查當前狀態／日期；不要求聊天貼金鑰，不把桌面更新當最終自動架構|S2《交接待辦》A及獨立提醒
|補25 測試資料與正式帳務隔離|跨全部|中央hubLinkSheet／測試網址；後台UI|測試網址會用同一真實帳戶資料，並非自動沙盒|S3後台截圖文字明示「存入是真的存」；本輪fixtures未寫真帳|改用測試帳戶／匿名化試算表，正式資產不可作破壞性回歸|S3 image(7)、image(8)；S4§九

## 最高優先序與下一個具體交付

|優先序|關聯任務|本輪／下一步|禁止過度宣稱|
|---|---|---|---|
|P0|補09、補25|後台閘門離線14項及使用者版本截圖已具備；尚待非破壞性線上確認。所有候選保持未核准|不可說已確認真09:00排程安全或已發布正式App|
|P0|12、16、補04|54o防假CCC已局部實作，但引發整頁未知回歸；54p按範圍顯示已有結果，等待測試站確認|不是逐卡十指標模型完成，不是市場預測驗證|
|P0|9、14、補03|持續除錯ownOnly大盤補值：54q研究碼＋8測試；**預設組合及長期代理仍待完整整合**|不能把此單一路徑修正說成代理資料問題全修好；研究版不部署|
|P0|2、3、8|用實際失敗輸入診斷七配置空白、缺年齡、50%現金；不改原資產或臆降現金|7方案內建資料可算不代表使用者異常已修復|
|P1|12、16、D13|建立合法成交來源、身份／鑑定／幣別一致的市場樣本，時間留出與簡單基準比較；繼續研究|官方文件／MLB API本輪被代理403；沒有取得授權或真成交，不造資料、不造係數|
|P1|補01、補10、補11、補15–20|先修必要帳務／資料健康，再減少手動上傳與桌面依賴；以各自可驗收單位交付|有排程函式不等於無人值守已驗證|
|P2|6、13–16、D1–D12|依原序與依賴逐項補來源／OOS／範圍與回歸；維持既有功能|不得把上一助手聲稱「已做」當驗收|

## 稽核尚未能封口的來源

1. 第14後半、17與18原文仍未找回；6已回填截圖可見備註，但是否有隱藏長文仍未知。
2. Claude完整對話未提供，只有截圖與摘要；分享頁無法讀取。新增原文到達時，逐項增補「來源／差異」，不覆蓋既有編號。
3. 目前中央完整檔案清單未由GAS API匯出驗證；已提供App／核心／中央及manifest，不假定不存在其他檔案。
4. 舊研究程式的報告與版本未全重跑；要求真實模型參數清冊及OOS證據之工作仍未完成。
5. 本表未把任何原1–16整項標成完成；也不以缺少驗收推定既有功能一定壞掉。

## 批次交付規則（使用者2026-10-26效率要求）

不再把每個小修正、研究版或單一測試成功交給使用者逐版安裝。下一個可交付批次固定涵蓋：

1. **錯誤評級及範圍**：球員卡／收藏品不假給CCC，已有資產分析與重要圖表保留，未知不當零；明列完整逐卡模型仍在研究。
2. **配置與資料**：七方案及持倉／自選股的缺資料、補零、代理資料、顯示與儲存路徑一起整合；部分證據不可冒充全組合評級，總資產不能漏算。
3. **年齡與現金**：新舊帳戶年齡／退休資料、必要支出及現金拆分可核對；不擅改既定配置政策或真持倉。
4. **部署與回歸**：原功能／帳務／圖表、批次檢查及發布閘門；只有完整批次達到適用驗收條件才提供一次安裝、一次集中試用。

54q等內部研究版不請使用者安裝。只在缺少無法推斷的資料、權限或必須由實際裝置確認時，集中提出必要事項。完整市場模型與原1–16及補充任務仍保留在上表，不因這批以阻斷錯誤為範圍而刪除或宣稱全部完成。

目前批次狀態：**尚未可交付**。預設組合／長期代理與使用者實際缺資料、年齡／現金情境尚未完整驗證；離線檢查全過也不能跳過這些缺口。
