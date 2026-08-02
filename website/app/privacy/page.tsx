// @ai-context
// 隐私政策页：面向用户的个人信息保护说明，符合《个人信息保护法》(PIPL) 要求。
// Privacy Policy page: PIPL-compliant personal information protection notice for students.
// Why: 面向学生群体产品需特别关注未成年人保护与数据本地化说明。
import type { Metadata } from "next";

/** 页面元数据 — 隐私政策 */
export const metadata: Metadata = {
  title: "隐私政策",
  description: "了解熵减如何收集、使用和保护你的个人信息。",
  robots: { index: false, follow: false },
};

/** 章节标题组件 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-xl sm:text-2xl font-semibold text-kb-text mt-12 mb-4">
      {children}
    </h2>
  );
}

/** 段落文本组件 */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-kb-text2 leading-[1.9] text-[15px] mb-4">{children}</p>
  );
}

/**
 * 隐私政策页面
 * 内容依据《中华人民共和国个人信息保护法》(PIPL) 编写，
 * 重点说明信息收集范围、使用目的、存储方式及用户权利。
 */
export default function PrivacyPage() {
  return (
    <div className="pt-36 pb-24">
      <div className="max-w-2xl mx-auto px-6">
        {/* 页面标题区 */}
        <header className="text-center mb-16">
          <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">
            Privacy Policy
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-kb-text mb-4">
            隐私政策
          </h1>
          <p className="text-kb-text2 text-sm">
            最后更新：2026 年 8 月 1 日
          </p>
        </header>

        {/* 引言 */}
        <P>
           {'熵减（以下简称"我们"或"本产品"）深知个人信息对你的重要性。本隐私政策说明我们如何收集、使用、存储和保护你在使用熵减桌面应用（以下简称"本应用"）过程中产生的个人信息。'}
        </P>
        <P>
          我们遵循<strong className="text-kb-text font-medium">本地优先</strong>原则——你的学习数据默认存储在你的设备本地，仅在主动开启云同步时才会上传至服务器。
        </P>

        {/* 一、收集的个人信息类型 */}
        <SectionTitle>一、我们收集哪些信息</SectionTitle>
        <P>
          根据你使用的功能，我们可能收集以下信息：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>
            <strong className="text-kb-text">账号信息：</strong>
            注册或登录时提供的用户名、邮箱地址（用于账号标识与找回）。
          </li>
          <li>
            <strong className="text-kb-text">学习数据：</strong>
            番茄钟记录、笔记内容、闪卡数据、复习历史、学习统计等。
            <span className="text-kb-text3">（默认存储于本地设备）</span>
          </li>
          <li>
            <strong className="text-kb-text">设备信息：</strong>
            设备型号、操作系统版本、应用版本号（用于故障排查与兼容性优化）。
          </li>
          <li>
            <strong className="text-kb-text">使用日志：</strong>
            应用启动时间、功能使用频次（仅以聚合匿名形式用于产品改进）。
          </li>
        </ul>
        <P>
          <strong className="text-kb-text">我们不主动收集：</strong>
          你的真实姓名、身份证号、银行卡信息、精确地理位置等敏感个人信息。
        </P>

        {/* 二、信息的使用方式 */}
        <SectionTitle>二、我们如何使用这些信息</SectionTitle>
        <P>我们收集的信息仅用于以下目的：</P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>提供账号登录与跨设备数据同步服务；</li>
          <li>生成个人学习报告与统计图表；</li>
          <li>通过 AI 网关提供智能笔记摘要、知识问答等辅助功能；</li>
          <li>诊断应用故障，改进产品体验与性能；</li>
          <li>发送与你账号安全相关的必要通知（如异地登录提醒）。</li>
        </ul>
        <P>
          我们不会将你的个人信息用于广告推送或向任何第三方出售。
        </P>

        {/* 三、信息的存储与保护 */}
        <SectionTitle>三、信息的存储与保护</SectionTitle>
        <P>
          <strong className="text-kb-text">本地优先存储：</strong>
          你的全部学习数据（笔记、闪卡、番茄钟记录）默认存储于你的设备本地数据库中，不经由网络传输，不上传至任何服务器。
        </P>
        <P>
          <strong className="text-kb-text">云同步（可选）：</strong>
          当你主动开启跨设备同步功能时，数据将加密传输至我们的同步服务器，并采用端到端加密保护。服务器仅存储同步所需的最小数据集合。
        </P>
        <P>
          <strong className="text-kb-text">安全措施：</strong>
          我们采用行业通用的安全措施保护你的信息，包括但不限于传输加密（TLS）、数据加密存储、访问权限控制。但请注意，互联网传输不存在绝对安全，我们无法对不可抗力导致的信息泄露承担责任。
        </P>
        <P>
          <strong className="text-kb-text">数据保留期限：</strong>
          本地数据在你卸载应用前始终保留在你的设备上；云端同步数据在你注销账号后 30 日内从服务器彻底删除。
        </P>

        {/* 四、第三方服务 */}
        <SectionTitle>四、第三方服务</SectionTitle>
        <P>
          为提供完整功能，本应用可能使用以下第三方服务：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>
            <strong className="text-kb-text">AI 网关服务：</strong>
            当你使用 AI 辅助功能（智能摘要、知识问答等）时，你的提问内容将发送至 AI 模型提供商（如通义千问、DeepSeek、智谱 AI 等）进行处理。我们不会将你的学习数据用于训练任何 AI 模型。
          </li>
          <li>
            <strong className="text-kb-text">数据同步服务：</strong>
            跨设备同步功能通过我们自建的同步服务器实现，数据在传输过程中加密。
          </li>
          <li>
            <strong className="text-kb-text">软件更新服务：</strong>
            应用通过 GitHub Releases 获取更新包，该过程不涉及个人信息传输。
          </li>
        </ul>

        {/* 五、用户权利 */}
        <SectionTitle>五、你的权利</SectionTitle>
        <P>根据《个人信息保护法》，你对自己的个人信息享有以下权利：</P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>
            <strong className="text-kb-text">查看权：</strong>
            你可以在应用内随时查看自己的所有学习数据与账号信息。
          </li>
          <li>
            <strong className="text-kb-text">修改权：</strong>
            你可以自由编辑、更正你的个人信息与学习记录。
          </li>
          <li>
            <strong className="text-kb-text">删除权：</strong>
            你可以随时删除应用内的任何数据；注销账号后，云端数据将在 30 日内彻底删除。
          </li>
          <li>
            <strong className="text-kb-text">撤回同意权：</strong>
            你可以随时关闭云同步、AI 辅助等可选功能，停止相关数据的传输。
          </li>
          <li>
            <strong className="text-kb-text">数据可携带权：</strong>
            你可以导出自己的全部学习数据（支持通用格式）。
          </li>
        </ul>

        {/* 六、未成年人保护 */}
        <SectionTitle>六、未成年人保护</SectionTitle>
        <P>
          熵减面向学生群体设计，我们特别重视未成年人的个人信息保护：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>
            未满 14 周岁的用户应在监护人的指导下使用本应用，并由监护人代为同意本隐私政策。
          </li>
          <li>
            我们仅收集提供学习服务所必需的最少信息，不过度采集未成年人数据。
          </li>
          <li>
            监护人有权随时查看、修改或删除被监护人的个人信息，如需协助请联系我们。
          </li>
          <li>
            我们不会向未成年人推送任何商业广告或不适宜内容。
          </li>
        </ul>

        {/* 七、Cookie 与跟踪技术 */}
        <SectionTitle>七、Cookie 与跟踪技术</SectionTitle>
        <P>
          本应用为桌面客户端，不使用浏览器 Cookie。官网（entropydecrease.com）可能使用必要的 Cookie 维持基本功能（如主题偏好记忆），但不用于广告追踪或用户画像。
        </P>
        <P>
          官网不接入任何第三方分析工具或广告追踪 SDK，不构建用户画像。
        </P>

        {/* 八、政策更新 */}
        <SectionTitle>八、隐私政策更新</SectionTitle>
        <P>
          我们可能适时修订本隐私政策。重大变更将通过应用内通知或官网公告的方式提前告知。继续使用本应用即表示你同意修订后的政策。
        </P>

        {/* 九、联系方式 */}
        <SectionTitle>九、联系我们</SectionTitle>
        <P>
          如对本隐私政策有任何疑问、投诉或个人信息相关请求，请通过以下方式联系我们：
        </P>
        <ul className="list-none text-kb-text2 leading-[1.9] text-[15px] space-y-1 mb-8">
          <li>邮箱：contact@entropydecrease.com</li>
          <li>GitHub Issues：
            <a
              href="https://github.com/Aparencia/Entropydecrease/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kb-brand underline-offset-4 hover:underline"
            >
              github.com/Aparencia/Entropydecrease/issues
            </a>
          </li>
        </ul>

        {/* 底部分隔 */}
        <div className="mt-16 pt-8 text-center text-xs text-kb-text3" style={{ borderTop: "1px solid var(--kb-border-default)" }}>
          本隐私政策依据《中华人民共和国个人信息保护法》(PIPL) 编写，适用于中国大陆用户。
        </div>
      </div>
    </div>
  );
}
