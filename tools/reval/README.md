# 實價登錄估價表（re/）怎麼重算

每季內政部公布新一季後（季後第一個月中），後台會提醒。資料：plvr.land.moi.gov.tw →「非本期下載」→「前季下載」→ CSV、進階下載，
臺北市(A)、新北市(F)、桃園市(H) 勾「不動產買賣」和「預售屋買賣」。用最近 8 季（兩年）。

把每季的 zip 各自解壓到一個資料夾（例如 data/115S3/），然後：

```
# 1. 成屋：清理 → 交叉驗證（產生 cv.pkl，區間用）→ 匯出 base.json＋d/
python3 -I -W ignore hedonic.py data 1130701      # 第二個參數＝最早成交日（民國 yyymmdd），約兩年前；產生 data/clean.pkl
python3 -I -W ignore model2.py data               # 誤差報告＋data/cv.pkl（hedonic_build.py 要放在 data 的上一層）
python3 -I -W ignore export.py data out           # out/base.json、out/d/dNN.json
# 2. 預售屋：同建案成交 → out/p/pNN.json（一定要在 export 之後跑，會寫進 base.json）
python3 -I presale.py out data/*
```

out/ 的內容整個取代 GitHub 上的 app-install/re/（base.json、d/、p/）。App 不用重新部署；
各使用者的房子會在隔天自動重估（base.json 的 season 變了就重估，「採用自動估價」的估值也會跟著更新）。

注意：
- 檔名一律英數字（d00.json…），中文行政區對照在 base.json 的 files / pfiles。
- 地址解析規則（reAddr_ / parse）Python 和 RealEstate.gs 必須一致，改一邊要改另一邊。
- 驗證：拿 sample_check.json 用 RealEstate.gs 的 reValLu_ 重算，要跟 Python 一致。
