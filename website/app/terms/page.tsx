// @ai-context
// 用户协议页：服务条款与免责声明，约束用户与平台之间的权利义务关系。
// Terms of Service page: service terms, user responsibilities, and disclaimers.
// Why: 明确权责边界，降低法律纠纷风险；特别注明 AI 生成内容不构成专业建议。
import type { Metadata } from "next";

/** 页面元数据 — 用户协议 */
export const metadata: Metadata = {
  title: "用户协议",
  description: "熵减用户协议与服务条款。",
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
 * 用户协议页面
 * 依据《中华人民共和国民法典》及相关法律法规编写，
 * 明确服务提供方与用户之间的权利义务关系。
 */
export default function TermsPage() {
  return (
    <div className="pt-36 pb-24">
      <div className="max-w-2xl mx-auto px-6">
        {/* 页面标题区 */}
        <header className="text-center mb-16">
          <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">
            Terms of Service
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-kb-text mb-4">
            用户协议
          </h1>
          <p className="text-kb-text2 text-sm">
            最后更新：2026 年 8 月 1 日
          </p>
        </header>

        {/* 引言 */}
        <P>
           {'欢迎使用熵减（以下简称"本应用"或"本服务"）。本用户协议（以下简称"本协议"）是你（以下简称"用户"）与熵减开发团队之间关于使用本服务所订立的协议。请在使用前仔细阅读以下条款。'}
        </P>
        <P>
          你下载、安装或使用本应用，即表示你已阅读、理解并同意接受本协议全部条款的约束。如不同意，请停止使用。
        </P>

        {/* 一、服务描述 */}
        <SectionTitle>一、服务描述</SectionTitle>
        <P>
          熵减是一款面向学生与终身学习者的桌面应用，提供以下核心功能：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>番茄钟专注计时与学习统计；</li>
          <li>智能笔记编辑与管理；</li>
          <li>闪卡创建与间隔重复复习；</li>
          <li>AI 辅助学习功能（智能摘要、知识问答等，需联网可选使用）；</li>
          <li>跨设备数据同步（需登录账号，可选功能）。</li>
        </ul>
        <P>
          本应用的核心学习功能完全本地运行，不依赖网络连接。AI 辅助与云同步为可选增强功能。
        </P>

        {/* 二、用户账号 */}
        <SectionTitle>二、用户账号</SectionTitle>
        <P>
          你可以无需注册直接使用本应用的本地功能。若需使用云同步等联网功能，则需注册账号并遵守以下约定：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>账号信息应真实有效，不得冒用他人身份；</li>
          <li>妥善保管账号密码，因账号保管不善导致的损失由用户自行承担；</li>
          <li>不得将账号转让、出租或与他人共享；</li>
          <li>如发现账号被未经授权使用，请立即联系我们。</li>
        </ul>

        {/* 三、用户责任 */}
        <SectionTitle>三、用户责任</SectionTitle>
        <P>在使用本服务时，你同意不从事以下行为：</P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>利用本应用从事任何违反中华人民共和国法律法规的活动；</li>
          <li>对本应用进行逆向工程、反编译、反汇编或破解；</li>
          <li>未经授权批量抓取或提取应用中的数据；</li>
          <li>通过自动化脚本或机器人滥用本服务；</li>
          <li>上传、传播含有违法、侵权、色情、暴力等不良内容的信息；</li>
          <li>干扰或破坏本服务的正常运行。</li>
        </ul>

        {/* 四、知识产权 */}
        <SectionTitle>四、知识产权</SectionTitle>
        <P>
          本应用的名称、标识、界面设计、源代码及相关素材的知识产权归熵减开发团队所有，受《中华人民共和国著作权法》及国际知识产权条约保护。
        </P>
        <P>
          本应用已开源，你可以在遵守开源许可证（见 GitHub 仓库 LICENSE 文件）的前提下使用、修改和分发源代码。开源授权不意味着放弃知识产权。
        </P>
        <P>
          你在使用本应用过程中创作的内容（笔记、闪卡等）的知识产权归你所有。
        </P>

        {/* 五、AI 辅助功能声明 */}
        <SectionTitle>五、AI 辅助功能声明</SectionTitle>
        <P>
          本应用提供的 AI 辅助功能（包括但不限于智能摘要、知识问答、学习建议等）基于大语言模型生成，具有如下特性：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>AI 生成内容仅供参考，不构成专业学术建议或权威结论；</li>
          <li>AI 可能产生不准确、不完整或有偏差的信息，用户应自行甄别；</li>
          <li>我们不保证 AI 功能的持续可用性和响应速度；</li>
          <li>你使用 AI 功能时提交的提问内容可能发送至第三方模型提供商处理。</li>
        </ul>

        {/* 六、免责声明 */}
        <SectionTitle>六、免责声明</SectionTitle>
        <P>
           <strong className="text-kb-text">{'服务按"现状"提供：'}</strong>
          {'本应用在"现状"基础上提供，我们不对服务的适用性、可靠性、准确性或无错误运行作出任何明示或暗示的保证。'}
        </P>
        <P>
          <strong className="text-kb-text">不可抗力：</strong>
          因自然灾害、网络故障、服务器宕机、黑客攻击等不可抗力或非我们过错原因导致服务中断或数据损失的，我们不承担责任，但将尽合理努力恢复服务。
        </P>
        <P>
          <strong className="text-kb-text">学习效果：</strong>
          本应用提供学习工具与方法论支持，但不保证使用后一定达到特定学习效果。学习成果取决于个人的努力与实际情况。
        </P>
        <P>
          <strong className="text-kb-text">间接损失：</strong>
          在适用法律允许的最大范围内，我们不对因使用或无法使用本服务造成的任何间接、附带、特殊或后果性损失承担责任。
        </P>

        {/* 七、服务变更与终止 */}
        <SectionTitle>七、服务变更与终止</SectionTitle>
        <P>
          我们保留在必要时对服务进行调整、暂停或终止的权利，包括但不限于：
        </P>
        <ul className="list-disc pl-6 text-kb-text2 leading-[1.9] text-[15px] space-y-2 mb-6">
          <li>为改进体验而更新功能或界面（将通过更新日志告知）；</li>
          <li>因维护、升级等原因暂时中断云服务（将提前公告）；</li>
          <li>用户违反本协议条款时，限制或终止其账号的使用权限；</li>
          <li>因不可抗力或法律要求永久停止服务（将提前合理期限通知）。</li>
        </ul>
        <P>
          你可以随时停止使用本应用或注销账号。注销后本地数据不受影响，云端数据将在 30 日内删除。
        </P>

        {/* 八、争议解决 */}
        <SectionTitle>八、争议解决</SectionTitle>
        <P>
          本协议受中华人民共和国法律管辖。因本协议产生的或与之相关的任何争议，双方应首先通过友好协商解决。协商不成的，任一方有权向有管辖权的人民法院提起诉讼。
        </P>

        {/* 九、协议修改 */}
        <SectionTitle>九、协议修改</SectionTitle>
        <P>
          我们可能适时修订本协议。修订后的协议将通过应用内通知或官网公告方式提前告知。重大变更将给予你合理时间审阅。继续使用本应用即表示你接受修订后的协议；如不接受，请停止使用。
        </P>

        {/* 十、联系方式 */}
        <SectionTitle>十、联系我们</SectionTitle>
        <P>
          如对本协议有任何疑问或建议，请通过以下方式联系：
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
          本协议依据《中华人民共和国民法典》及相关法律法规编写，适用于中国大陆用户。
        </div>
      </div>
    </div>
  );
}
