//! 领域种子词表数据（REQ-190 / v0.9.0 M3：粗 20 领域 × 种子词表；v0.13.6 +5）。
//!
//! @ai-context: 与 video_profile_domain.rs 类型/检测逻辑分离（保持 ≤300 行）；
//!              每领域 8-15 个高频种子词（覆盖 hotwords 预热/标题投票/术语筛选，
//!              词表可按校准流程扩充——纯数据模块）。
//! @ai-context: impl DomainKind（label/parse/as_str）自 video_profile_domain.rs 迁入
//!              （v0.13.6 拆分计划——类型文件维持 ≤300；跨文件 impl 先例 LiveSessionManager）。
//! @ai-context: 词表选词口径：领域高辨识度词（平台分区/标题/术语命中率高的
//!              常见词），避免过于通用词（"学习"不属于任何领域专属）。

use crate::video_profile_domain::DomainKind;

/// DomainKind 静态映射（label/parse/as_str——20 类；解析失败 → None 诚实不猜）。
impl DomainKind {
    /// 前端展示名（检测卡 v2 下拉用；登记豁免 dead_code——M5 接线，
    /// 目标激活版本：v0.12.0）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            DomainKind::Economy => "经济管理",
            DomainKind::Programming => "编程开发",
            DomainKind::MathScience => "数学理科",
            DomainKind::Language => "语言学习",
            DomainKind::Beauty => "化妆美妆",
            DomainKind::Fitness => "健身运动",
            DomainKind::Law => "法律",
            DomainKind::Medical => "医学健康",
            DomainKind::Career => "职场技能",
            DomainKind::Design => "设计创意",
            DomainKind::Music => "音乐",
            DomainKind::Handcraft => "手工",
            DomainKind::Exam => "考试考证",
            DomainKind::Gaming => "游戏电竞",
            DomainKind::Psychology => "心理成长",
            DomainKind::Cooking => "美食烹饪",
            DomainKind::PhotoVideo => "摄影视频",
            DomainKind::HistoryHumanities => "历史人文",
            DomainKind::Writing => "写作阅读",
            DomainKind::TechGadgets => "数码硬件",
        }
    }

    /// 解析前端传入的领域标识（kebab-case）；非法值 → None（诚实不猜）。
    pub fn parse(s: &str) -> Option<DomainKind> {
        match s {
            "economy" => Some(DomainKind::Economy),
            "programming" => Some(DomainKind::Programming),
            "math-science" => Some(DomainKind::MathScience),
            "language" => Some(DomainKind::Language),
            "beauty" => Some(DomainKind::Beauty),
            "fitness" => Some(DomainKind::Fitness),
            "law" => Some(DomainKind::Law),
            "medical" => Some(DomainKind::Medical),
            "career" => Some(DomainKind::Career),
            "design" => Some(DomainKind::Design),
            "music" => Some(DomainKind::Music),
            "handcraft" => Some(DomainKind::Handcraft),
            "exam" => Some(DomainKind::Exam),
            "gaming" => Some(DomainKind::Gaming),
            "psychology" => Some(DomainKind::Psychology),
            "cooking" => Some(DomainKind::Cooking),
            "photo-video" => Some(DomainKind::PhotoVideo),
            "history-humanities" => Some(DomainKind::HistoryHumanities),
            "writing" => Some(DomainKind::Writing),
            "tech-gadgets" => Some(DomainKind::TechGadgets),
            _ => None,
        }
    }

    /// 领域标识（kebab-case，与 parse/serde 同口径；落库/传输用，
    /// 登记豁免 dead_code——会话落库接线在 M5 检测卡 v2，目标激活版本：v0.12.0）。
    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            DomainKind::Economy => "economy",
            DomainKind::Programming => "programming",
            DomainKind::MathScience => "math-science",
            DomainKind::Language => "language",
            DomainKind::Beauty => "beauty",
            DomainKind::Fitness => "fitness",
            DomainKind::Law => "law",
            DomainKind::Medical => "medical",
            DomainKind::Career => "career",
            DomainKind::Design => "design",
            DomainKind::Music => "music",
            DomainKind::Handcraft => "handcraft",
            DomainKind::Exam => "exam",
            DomainKind::Gaming => "gaming",
            DomainKind::Psychology => "psychology",
            DomainKind::Cooking => "cooking",
            DomainKind::PhotoVideo => "photo-video",
            DomainKind::HistoryHumanities => "history-humanities",
            DomainKind::Writing => "writing",
            DomainKind::TechGadgets => "tech-gadgets",
        }
    }
}

/// 领域 → 种子词表（匹配用：text.contains(seed)；热词注入原文）。
pub fn seed_words(kind: DomainKind) -> Vec<String> {
    let words: &[&str] = match kind {
        DomainKind::Economy => &[
            "经济", "理财", "公积金", "基金", "股票", "保险", "税务", "买房", "贷款", "工资", "财务", "投资", "货币", "GDP",
        ],
        DomainKind::Programming => &[
            "编程", "代码", "开发", "Python", "Java", "JavaScript", "前端", "后端", "算法", "数据库", "函数", "变量", "框架", "API", "部署",
        ],
        DomainKind::MathScience => &[
            "数学", "微积分", "代数", "几何", "物理", "化学", "生物", "公式", "定理", "方程", "实验", "导数", "函数", "分子", "原子",
        ],
        DomainKind::Language => &[
            "英语", "单词", "语法", "口语", "听力", "阅读", "雅思", "托福", "日语", "韩语", "发音", "作文", "汉字", "拼音",
        ],
        DomainKind::Beauty => &[
            "化妆", "美妆", "护肤", "眼影", "口红", "粉底", "穿搭", "发型", "遮瑕", "修容", "面膜", "精华",
        ],
        DomainKind::Fitness => &[
            "健身", "运动", "瑜伽", "跑步", "拉伸", "肌肉", "减脂", "增肌", "深蹲", "训练", "体态", "普拉提",
        ],
        DomainKind::Law => &[
            "法律", "法规", "合同", "律师", "诉讼", "权益", "劳动法", "民法典", "判例", "法条", "仲裁", "维权",
        ],
        DomainKind::Medical => &[
            "医学", "健康", "疾病", "症状", "治疗", "药物", "医生", "营养", "疫苗", "体检", "饮食", "睡眠", "心理",
        ],
        DomainKind::Career => &[
            "职场", "办公", "面试", "简历", "汇报", "Excel", "PPT", "Word", "管理", "沟通", "效率", "团队", "升职",
        ],
        DomainKind::Design => &[
            "设计", "绘画", "插画", "配色", "排版", "PS", "Photoshop", "海报", "logo", "素描", "创意", "视觉",
        ],
        DomainKind::Music => &[
            "音乐", "乐理", "钢琴", "吉他", "和弦", "节拍", "谱", "演唱", "编曲", "旋律", "音符", "音阶",
        ],
        DomainKind::Handcraft => &[
            "手工", "DIY", "编织", "折纸", "陶艺", "木工", "缝纫", "黏土", "串珠", "烘焙",
        ],
        DomainKind::Exam => &[
            "考试", "考证", "考研", "高考", "公务员", "真题", "刷题", "答题", "考点", "冲刺", "备考", "模拟题",
        ],
        DomainKind::Gaming => &[
            "游戏", "攻略", "电竞", "副本", "装备", "英雄联盟", "原神", "王者", "通关", "boss", "操作",
        ],
        DomainKind::Psychology => &[
            "心理", "成长", "情绪", "焦虑", "压力", "习惯", "认知", "冥想", "思维", "自律", "人生", "哲学",
        ],
        // v0.13.6：美食烹饪（烘焙自手工迁入）
        DomainKind::Cooking => &[
            "美食", "菜谱", "做饭", "炒菜", "炖", "烤箱", "烘焙", "蛋糕", "面包", "配料", "调味", "料理",
        ],
        // v0.13.6：摄影视频制作
        DomainKind::PhotoVideo => &[
            "摄影", "摄像", "相机", "镜头", "景深", "剪映", "剪辑", "调色", "拍片", "pr", "画面", "构图",
        ],
        // v0.13.6：历史人文社科
        DomainKind::HistoryHumanities => &[
            "历史", "朝代", "古代", "人文", "哲学", "国学", "社科", "著作", "人物", "典故", "思想", "文明",
        ],
        // v0.13.6：写作阅读
        DomainKind::Writing => &[
            "写作", "小说", "文案", "投稿", "阅读", "读后感", "书评", "文笔", "叙事", "稿", "写作技巧",
        ],
        // v0.13.6：数码硬件
        DomainKind::TechGadgets => &[
            "数码", "评测", "装机", "显卡", "主板", "CPU", "手机", "笔记本", "维修", "硬件", "电脑",
        ],
    };
    words.iter().map(|w| w.to_string()).collect()
}
