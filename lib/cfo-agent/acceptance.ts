import { D } from "./calculations";
import type { CfoAgentSnapshot } from "./types";

// Frozen ledger reference supplied by ALFAS CFO, 03.10.2026. Changing these
// values is a new acceptance reference, never automatic adaptation to output.
export function evaluateCfoAcceptance(snapshot:CfoAgentSnapshot) {
  const md=snapshot.products.find(p=>p.sku==="MD-3003B1"&&p.channel==="TRENDYOL");
  const anunnaki=snapshot.products.find(p=>p.sku==="ANUNNAKI-POINTER");
  const koctas=snapshot.channels.find(c=>c.channel==="MIRAKL_KOCTAS");
  const percent=md?.commissionRate.value==null?null:D(md.commissionRate.value).mul(100).toDecimalPlaces(2).toNumber();
  const values:[string,unknown,unknown,boolean?][]=[
    ["commercial_cash",snapshot.cash.cash.value,72483.62],
    ["unused_general_overdraft",snapshot.cash.generalUnusedOverdraft.value,1809300],
    ["purpose_overdraft_separate",snapshot.cash.purposeLimit.value,750000,snapshot.cash.cash.value===72483.62&&snapshot.cash.generalUnusedOverdraft.value===1809300],
    ["total_card_debt_six_active_cards",snapshot.cash.totalCardDebt.value,2366017.30,snapshot.cash.activeCards===6],
    ["excluded_dummy_skus",snapshot.dataQuality.excludedDummyStock,47],
    ["zero_inventory_skus",snapshot.dataQuality.zeroStockSkuCount,1086],
    ["md3003b1_entegra_units30",md?.salesUnits30.value??null,81],
    ["md3003b1_xml_units30",md?.xmlUnits30.value??null,222],
    ["md3003b1_cautious_velocity",md?.velocity.value??null,5.33],
    ["md3003b1_trendyol_commission_43_records",percent,12.88,md?.commissionSamples===43],
    ["anunnaki_stock_coverage_170_units",anunnaki?.stockDays.value??null,124,anunnaki?.stockQty===170],
    ["koctas_contribution_unknown",koctas?koctas.profitability.contributionProfit.value:"channel_missing",null],
  ];
  const criteria:Record<string,Record<string,{actual:unknown;expected:unknown}>>={
    total_card_debt_six_active_cards:{activeCards:{actual:snapshot.cash.activeCards,expected:6}},
    md3003b1_trendyol_commission_43_records:{acceptedRecords:{actual:md?.commissionSamples??null,expected:43}},
    anunnaki_stock_coverage_170_units:{stockQty:{actual:anunnaki?.stockQty??null,expected:170}},
  };
  return values.map(([id,actual,expected,condition=true])=>({id,actual,expected,passed:actual===expected&&condition,
    ...(criteria[id]?{criteria:criteria[id]}:{})}));
}
