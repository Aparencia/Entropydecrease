//! 细目金数据（REQ-220 / v0.13.6：84 项细目全表）。
//!
//! @ai-context: 与 video_profile_domain_fine.rs 查询逻辑分离（≤300 行）；
//!              每细目带 5-8 个高辨识度种子（检测匹配 + hotwords 细分），
//!              选词口径同粗词表：领域专属词、避免通用词。
//! @ai-context: FINE_TABLE 顺序 = UI chips 展示顺序；细目 id kebab-case 与
//!              DomainTag.fine 字符串契约一致（改 id = 破坏落库契约，仅新增）。

use crate::video_profile_domain::DomainKind;
use crate::video_profile_domain_fine::FineTag;

/// 全表：20 粗领域 × 4-6 细目（共 84 项）。
pub static FINE_TABLE: &[(DomainKind, &[FineTag])] = &[
    (
        DomainKind::Economy,
        &[
            FineTag { id: "invest", label: "投资理财", seeds: &["基金", "股票", "理财", "定投", "仓位"] },
            FineTag { id: "accounting", label: "会计财务", seeds: &["会计", "报表", "税务", "凭证", "审计"] },
            FineTag { id: "business", label: "商业管理", seeds: &["管理", "战略", "商业模式", "创业", "运营"] },
            FineTag { id: "macro", label: "宏观经济", seeds: &["宏观", "GDP", "通胀", "利率", "经济周期"] },
        ],
    ),
    (
        DomainKind::Programming,
        &[
            FineTag { id: "frontend", label: "前端", seeds: &["React", "Vue", "组件", "状态管理", "hooks", "CSS"] },
            FineTag { id: "backend", label: "后端", seeds: &["后端", "服务器", "接口", "数据库", "微服务", "Redis"] },
            FineTag { id: "ai-ml", label: "AI与机器学习", seeds: &["机器学习", "深度学习", "神经网络", "训练", "模型"] },
            FineTag { id: "data", label: "数据科学", seeds: &["数据分析", "数据挖掘", "SQL", "可视化", "ETL"] },
            FineTag { id: "mobile", label: "移动开发", seeds: &["Flutter", "Android", "iOS", "小程序", "React Native"] },
            FineTag { id: "devops", label: "运维部署", seeds: &["Docker", "K8s", "部署", "CI/CD", "Linux"] },
        ],
    ),
    (
        DomainKind::MathScience,
        &[
            FineTag { id: "math", label: "数学", seeds: &["微积分", "代数", "概率", "几何", "导数"] },
            FineTag { id: "physics", label: "物理", seeds: &["力学", "电磁", "量子", "物理", "相对论"] },
            FineTag { id: "chemistry", label: "化学", seeds: &["化学", "反应", "元素", "有机", "分子"] },
            FineTag { id: "biology", label: "生物", seeds: &["生物", "细胞", "基因", "进化", "生态"] },
        ],
    ),
    (
        DomainKind::Language,
        &[
            FineTag { id: "english", label: "英语", seeds: &["英语", "雅思", "托福", "四六级", "口语"] },
            FineTag { id: "japanese", label: "日语", seeds: &["日语", "五十音", "N1", "N2", "假名"] },
            FineTag { id: "korean", label: "韩语", seeds: &["韩语", "TOPIK", "韩文", "发音"] },
            FineTag { id: "chinese", label: "中文语文", seeds: &["语文", "文言文", "古诗", "成语", "阅读理解"] },
            FineTag { id: "other", label: "其他外语", seeds: &["法语", "德语", "西语", "俄语", "小语种"] },
        ],
    ),
    (
        DomainKind::Beauty,
        &[
            FineTag { id: "skincare", label: "护肤", seeds: &["护肤", "保湿", "防晒", "面膜", "精华"] },
            FineTag { id: "makeup", label: "化妆", seeds: &["眼影", "口红", "底妆", "腮红", "晕染"] },
            FineTag { id: "outfit", label: "穿搭", seeds: &["穿搭", "搭配", "风格", "衣橱", "配色"] },
            FineTag { id: "hair", label: "发型", seeds: &["发型", "编发", "卷发", "染发", "护发"] },
        ],
    ),
    (
        DomainKind::Fitness,
        &[
            FineTag { id: "strength", label: "力量训练", seeds: &["力量", "增肌", "深蹲", "卧推", "硬拉"] },
            FineTag { id: "cardio", label: "有氧", seeds: &["有氧", "减脂", "跑步", "跳绳", "燃脂"] },
            FineTag { id: "yoga", label: "瑜伽普拉提", seeds: &["瑜伽", "普拉提", "体式", "冥想", "呼吸"] },
            FineTag { id: "posture", label: "体态矫正", seeds: &["体态", "圆肩", "驼背", "矫正", "拉伸"] },
        ],
    ),
    (
        DomainKind::Law,
        &[
            FineTag { id: "labor", label: "劳动法", seeds: &["劳动法", "辞退", "加班", "工伤", "劳动合同"] },
            FineTag { id: "contract", label: "合同法", seeds: &["合同", "违约金", "条款", "签署"] },
            FineTag { id: "family", label: "婚姻家事", seeds: &["婚姻", "离婚", "抚养", "继承", "财产"] },
            FineTag { id: "criminal", label: "刑法", seeds: &["刑法", "犯罪", "量刑", "辩护", "证据"] },
        ],
    ),
    (
        DomainKind::Medical,
        &[
            FineTag { id: "clinical", label: "临床", seeds: &["症状", "诊断", "治疗", "用药", "临床"] },
            FineTag { id: "nutrition", label: "营养", seeds: &["营养", "膳食", "蛋白质", "维生素", "热量"] },
            FineTag { id: "tcm", label: "中医养生", seeds: &["中医", "穴位", "经络", "养生", "本草"] },
            FineTag { id: "lifestyle", label: "生活方式", seeds: &["睡眠", "作息", "减压", "习惯", "健康"] },
        ],
    ),
    (
        DomainKind::Career,
        &[
            FineTag { id: "office", label: "办公软件", seeds: &["Excel", "PPT", "Word", "函数", "模板"] },
            FineTag { id: "interview", label: "求职面试", seeds: &["面试", "简历", "求职", "offer", "hr"] },
            FineTag { id: "management", label: "管理", seeds: &["管理", "带团队", "组织", "项目", "OKR"] },
            FineTag { id: "communication", label: "沟通表达", seeds: &["沟通", "汇报", "表达", "演讲", "谈判"] },
        ],
    ),
    (
        DomainKind::Design,
        &[
            FineTag { id: "graphic", label: "平面设计", seeds: &["平面", "海报", "LOGO", "排版", "视觉"] },
            FineTag { id: "illustration", label: "绘画插画", seeds: &["素描", "插画", "水彩", "板绘", "构图"] },
            FineTag { id: "ux", label: "交互体验", seeds: &["UI", "UX", "交互", "原型", "体验"] },
            FineTag { id: "architecture", label: "建筑室内", seeds: &["建筑", "室内", "空间", "家具", "软装"] },
        ],
    ),
    (
        DomainKind::Music,
        &[
            FineTag { id: "theory", label: "乐理", seeds: &["乐理", "音阶", "和弦", "调式", "节奏"] },
            FineTag { id: "instrument", label: "器乐", seeds: &["钢琴", "吉他", "小提琴", "架子鼓", "指法"] },
            FineTag { id: "vocal", label: "声乐", seeds: &["声乐", "发声", "气息", "音准", "演唱"] },
            FineTag { id: "producing", label: "编曲制作", seeds: &["编曲", "混音", "宿主", "效果器", "采样"] },
        ],
    ),
    (
        DomainKind::Handcraft,
        &[
            FineTag { id: "knitting", label: "编织", seeds: &["编织", "毛线", "钩针", "棒针", "图解"] },
            FineTag { id: "woodwork", label: "木工", seeds: &["木工", "榫卯", "刨", "锯", "上漆"] },
            FineTag { id: "pottery", label: "陶艺", seeds: &["陶艺", "拉坯", "釉", "窑", "黏土"] },
            FineTag { id: "origami", label: "折纸", seeds: &["折纸", "折", "纸艺", "图解"] },
            FineTag { id: "beading", label: "串珠", seeds: &["串珠", "珠子", "手链", "编绳"] },
        ],
    ),
    (
        DomainKind::Exam,
        &[
            FineTag { id: "kaoyan", label: "考研", seeds: &["考研", "初试", "复试", "政治", "专业课"] },
            FineTag { id: "civil-service", label: "考公", seeds: &["公务员", "行测", "申论", "国考", "省考"] },
            FineTag { id: "certification", label: "职业资格", seeds: &["考证", "教资", "CPA", "二级", "证书"] },
            FineTag { id: "school", label: "升学", seeds: &["高考", "中考", "升学", "志愿", "期中"] },
        ],
    ),
    (
        DomainKind::Gaming,
        &[
            FineTag { id: "guide", label: "攻略", seeds: &["攻略", "通关", "打法", "路线", "技巧"] },
            FineTag { id: "esports", label: "电竞", seeds: &["电竞", "比赛", "战队", "冠军", "LPL"] },
            FineTag { id: "mobile-games", label: "手游", seeds: &["手游", "原神", "王者", "抽卡", "副本"] },
            FineTag { id: "console", label: "主机", seeds: &["主机", "PS5", "Switch", "Xbox", "独占"] },
        ],
    ),
    (
        DomainKind::Psychology,
        &[
            FineTag { id: "emotion", label: "情绪管理", seeds: &["情绪", "焦虑", "抑郁", "压力", "调节"] },
            FineTag { id: "cognition", label: "认知思维", seeds: &["认知", "思维", "批判", "决策", "偏差"] },
            FineTag { id: "habit", label: "习惯养成", seeds: &["习惯", "自律", "拖延", "坚持", "行为"] },
            FineTag { id: "relationships", label: "人际", seeds: &["沟通", "关系", "边界", "依恋", "相处"] },
        ],
    ),
    (
        DomainKind::Cooking,
        &[
            FineTag { id: "home", label: "家常菜", seeds: &["家常", "快手", "下饭", "炒", "炖"] },
            FineTag { id: "baking", label: "烘焙", seeds: &["烘焙", "烤箱", "面包", "蛋糕", "发酵"] },
            FineTag { id: "western", label: "西餐", seeds: &["西餐", "牛排", "意面", "沙拉", "摆盘"] },
            FineTag { id: "drink", label: "饮品咖啡", seeds: &["咖啡", "手冲", "饮品", "奶茶", "拉花"] },
        ],
    ),
    (
        DomainKind::PhotoVideo,
        &[
            FineTag { id: "photography", label: "摄影", seeds: &["摄影", "相机", "镜头", "光圈", "快门"] },
            FineTag { id: "videography", label: "摄像", seeds: &["摄像", "运镜", "跟拍", "稳定器", "机位"] },
            FineTag { id: "editing", label: "剪辑", seeds: &["剪辑", "剪映", "Premiere", "转场", "时间线"] },
            FineTag { id: "color-grading", label: "调色", seeds: &["调色", "LUT", "曲线", "白平衡", "还原"] },
        ],
    ),
    (
        DomainKind::HistoryHumanities,
        &[
            FineTag { id: "history", label: "历史", seeds: &["历史", "朝代", "古代", "近代", "战争"] },
            FineTag { id: "philosophy", label: "哲学", seeds: &["哲学", "苏格拉底", "理性", "形而上学", "伦理学"] },
            FineTag { id: "humanities", label: "人文社科", seeds: &["社会学", "人类学", "经济学", "政治学", "社科"] },
            FineTag { id: "classics", label: "国学经典", seeds: &["论语", "老子", "国学", "四书", "经典"] },
        ],
    ),
    (
        DomainKind::Writing,
        &[
            FineTag { id: "creative", label: "创意写作", seeds: &["写作", "小说", "短篇", "大纲", "人物"] },
            FineTag { id: "copywriting", label: "文案", seeds: &["文案", "标题", "转化", "广告", "软文"] },
            FineTag { id: "reading", label: "阅读方法", seeds: &["阅读", "速读", "精读", "笔记法", "拆书"] },
            FineTag { id: "book-notes", label: "读书笔记", seeds: &["书评", "读后感", "摘抄", "书单"] },
        ],
    ),
    (
        DomainKind::TechGadgets,
        &[
            FineTag { id: "review", label: "数码评测", seeds: &["评测", "开箱", "上手", "对比", "体验"] },
            FineTag { id: "pc-build", label: "装机", seeds: &["装机", "配置", "硬件", "兼容", "走线"] },
            FineTag { id: "repair", label: "维修", seeds: &["维修", "更换", "拆机", "故障", "排障"] },
            FineTag { id: "hardware", label: "硬件知识", seeds: &["CPU", "显卡", "主板", "内存", "硬盘"] },
        ],
    ),
];
