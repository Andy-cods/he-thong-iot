/** Bảng vật liệu / công đoạn chuẩn cho form sửa dòng BOM. */
/** Bảng vật liệu cứng Tier 1 V1.7-beta.2.3 (sẽ chuyển sang master V1.8). */
export const MATERIALS: Array<{ code: string; name: string; group: string }> = [
  { code: "POM", name: "POM (nhựa kỹ thuật)", group: "Plastic" },
  { code: "POM_ESD_BLACK", name: "POM ESD đen (chống tĩnh điện)", group: "Plastic" },
  { code: "PB108", name: "PB108 (nhựa chịu nhiệt)", group: "Plastic" },
  { code: "ACETAL_BLACK", name: "Acetal đen (POM đen)", group: "Plastic" },
  { code: "AL6061", name: "Nhôm AL6061 anode đen", group: "Aluminum" },
  { code: "AL6061_ANODE_CLEAR", name: "Nhôm AL6061 anode trong", group: "Aluminum" },
  { code: "MIC6", name: "Nhôm MIC6 (tấm cán)", group: "Aluminum" },
  { code: "SUS304", name: "Thép không gỉ SUS304", group: "Stainless steel" },
  { code: "SUS304_ELECTROPOLISH", name: "SUS304 điện hóa", group: "Stainless steel" },
  { code: "SUS316", name: "Thép không gỉ SUS316L", group: "Stainless steel" },
  { code: "SS400", name: "Thép SS400 (kết cấu)", group: "Carbon steel" },
  { code: "BRASS_C360", name: "Đồng C360 (đồng thau)", group: "Brass" },
];

/** Công đoạn chuẩn — user chọn multi theo thứ tự. */
export const PROCESSES: Array<{ code: string; name: string }> = [
  { code: "CUT", name: "Cắt" },
  { code: "WIRE_CUT", name: "Cắt dây EDM" },
  { code: "MILLING", name: "Phay CNC" },
  { code: "MCT", name: "MCT (Machining Center)" },
  { code: "DRILLING", name: "Khoan" },
  { code: "TAPPING", name: "Ta-rô" },
  { code: "LATHE", name: "Tiện CNC" },
  { code: "GRINDING", name: "Mài" },
  { code: "POLISHING", name: "Đánh bóng" },
  { code: "ANODIZING", name: "Anode (nhôm)" },
  { code: "BLACK_OXIDE", name: "Nhuộm đen (thép)" },
  { code: "ELECTROPOLISH", name: "Điện hóa" },
  { code: "HEAT_TREAT", name: "Nhiệt luyện" },
  { code: "LASER_MARK", name: "Khắc laser" },
  { code: "ASSEMBLY", name: "Lắp ráp" },
];

export const PROCESS_MAP = new Map(PROCESSES.map((p) => [p.code, p]));
