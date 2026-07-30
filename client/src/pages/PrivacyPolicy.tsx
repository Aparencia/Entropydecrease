/**
 * 隐私政策页面
 *
 * @ai-context: 页面组件：PrivacyPolicy。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-bg-primary">
      <div className="max-w-2xl mx-auto p-kb-xl">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft className="w-icon-sm h-icon-sm" />}
          onClick={() => navigate(-1)}
        >
          返回
        </Button>
        <div className="mt-kb-lg">
          <h1 className="text-d1 font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-icon-xl h-icon-xl text-brand-500" />
            隐私政策
          </h1>
          <p className="text-b3 text-text-tertiary mt-2">最后更新：2025-07-14</p>

          <div className="mt-kb-lg space-y-kb-md text-b1 text-text-secondary leading-relaxed">
            {/* 1. 引言 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">1. 引言</h2>
              <p className="mt-2">欢迎阅读熵减（又名"课伴"，英文名 Entropy Decrease，以下简称"本软件"）的隐私政策。本软件是一款面向个人学习者的桌面端学习辅助工具。我们深知个人信息对您的重要性，并会尽全力保护您的隐私安全。</p>
              <p className="mt-2">本隐私政策（以下简称"本政策"）适用于您通过本软件访问和使用的所有功能与服务。请您在使用本软件前仔细阅读并充分理解本政策的全部内容。若您不同意本政策的任何内容，请停止使用本软件。</p>
            </section>

            {/* 2. 数据收集范围 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">2. 数据收集范围</h2>
              <p className="mt-2">为向您提供学习辅助服务，本软件可能收集以下类型的信息：</p>
              <h3 className="text-b1 font-medium text-text-primary mt-3">2.1 账号信息</h3>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>您主动提供的昵称、头像等基本信息；</li>
                <li>若您开启云端同步，可能需要提供邮箱或其他账号标识信息。</li>
              </ul>
              <h3 className="text-b1 font-medium text-text-primary mt-3">2.2 学习记录</h3>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>结礁内容（包括富文本文本、图片等）；</li>
                <li>反衰减呼吸数据（卡片内容、复习记录、记忆曲线参数等）；</li>
                <li>深潜统计（专注时长、完成次数、时间分布等）；</li>
                <li>浮出水面学习记录（文字记录、评估结果等）。</li>
              </ul>
              <h3 className="text-b1 font-medium text-text-primary mt-3">2.3 应用使用数据</h3>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>各功能模块的使用频率与时长等本地统计数据；</li>
                <li>应用设置偏好（如主题、静音状态等）；</li>
                <li>上述数据仅存储于本地，不会自动上传至服务器。</li>
              </ul>
            </section>

            {/* 3. 数据存储方式 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">3. 数据存储方式</h2>
              <h3 className="text-b1 font-medium text-text-primary mt-3">3.1 本地优先策略</h3>
              <p className="mt-2">本软件采用"本地优先"的数据存储策略。您的所有学习数据默认存储在您的本地设备上，使用 SQLite 数据库进行管理。数据默认不会离开您的设备，您可以在离线状态下完整使用本软件的核心功能。</p>
              <h3 className="text-b1 font-medium text-text-primary mt-3">3.2 可选云端同步</h3>
              <p className="mt-2">云端同步功能为可选项，需要您主动在设置中开启。开启后，您的学习数据将通过加密通道（HTTPS/TLS）传输至我们的同步服务器。您可随时关闭云端同步，关闭后本地数据不受影响，云端数据将保留至您主动删除为止。</p>
            </section>

            {/* 4. AI 功能的数据处理 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">4. AI 功能的数据处理</h2>
              <p className="mt-2">本软件集成了 AI 辅助学习功能，包括但不限于内容摘要生成、智能反衰减呼吸生成、浮出水面学习法评估等。在使用上述功能时，请注意以下事项：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>您主动提交的内容（如选中的笔记文本、闪卡内容等）将被发送至第三方 AI 服务商进行处理；</li>
                <li>我们严格要求第三方服务商不得将您的数据用于 AI 模型训练或改善其服务；</li>
                <li>AI 处理完成后，返回结果仅用于在您的本地设备上展示，不会被服务端留存；</li>
                <li>第三方 AI 服务商可能有其独立的隐私政策，建议您查阅相关政策以了解其数据处理实践。</li>
              </ul>
              <p className="mt-2">若您不希望内容被发送至第三方 AI 服务商，请避免使用需要 AI 处理的功能模块。</p>
            </section>

            {/* 5. 数据加密与安全 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">5. 数据加密与安全</h2>
              <p className="mt-2">我们重视您的数据安全，并采取以下措施予以保护：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>本地加密备份：</strong>本软件支持对本地数据进行加密备份，防止未经授权的访问；</li>
                <li><strong>传输加密：</strong>云端同步数据传输全程采用 HTTPS/TLS 加密协议，确保数据在传输过程中的安全性；</li>
                <li><strong>访问控制：</strong>云端数据通过身份认证机制进行访问控制，仅您本人可访问；</li>
                <li><strong>最小权限原则：</strong>本软件仅请求运行所需的最低系统权限。</li>
              </ul>
              <p className="mt-2">尽管我们已采取合理的安全措施，但请您理解，互联网环境并非绝对安全，我们无法保证信息的绝对安全性。</p>
            </section>

            {/* 6. 用户数据权利 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">6. 用户数据权利</h2>
              <p className="mt-2">您对自己的数据享有以下权利：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>数据导出：</strong>您可随时将所有学习数据导出为 JSON 格式文件，便于迁移或备份；</li>
                <li><strong>数据删除：</strong>您可清除所有本地数据；若已开启云端同步，也可同步删除云端数据。删除操作不可撤销，请在操作前确认已完成备份；</li>
                <li><strong>数据访问与更正：</strong>您可随时在软件内查看、修改或删除您的学习记录和个人信息。</li>
              </ul>
            </section>

            {/* 7. Cookie 与追踪技术 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">7. Cookie 与追踪技术</h2>
              <p className="mt-2">本软件为桌面端应用，不使用传统的浏览器 Cookie 技术。但本软件可能使用本地存储标识符（如设备唯一标识、本地 Token 等）以实现以下目的：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>维持您的登录状态与同步会话；</li>
                <li>记录应用偏好设置；</li>
                <li>本地统计分析（数据不上传）。</li>
              </ul>
              <p className="mt-2">上述标识符仅存储于您的本地设备，不会用于跨设备追踪或广告投放。</p>
            </section>

            {/* 8. 未成年人保护 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">8. 未成年人保护</h2>
              <p className="mt-2">本软件面向广大学习者，其中可能包括未满 18 周岁的未成年人。我们重视未成年人的隐私保护，并建议：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>未成年人在监护人的指导和同意下使用本软件；</li>
                <li>监护人关注未成年人在使用本软件时的数据提交行为，特别是涉及 AI 功能的内容提交；</li>
                <li>若您是未成年人的监护人，并对本软件的数据处理有疑虑，请通过本政策末尾提供的联系方式与我们联系。</li>
              </ul>
            </section>

            {/* 9. 政策更新 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">9. 政策更新</h2>
              <p className="mt-2">我们保留在必要时对本隐私政策进行更新或修改的权利。政策更新后：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>更新后的政策将在本页面发布，并标注更新日期；</li>
                <li>重大变更将通过应用内通知的方式告知用户；</li>
                <li>更新生效后继续使用本软件，即视为您同意更新后的隐私政策。</li>
              </ul>
            </section>

            {/* 10. 联系方式 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">10. 联系方式</h2>
              <p className="mt-2">如果您对本隐私政策有任何疑问、意见或建议，可通过以下方式与我们联系：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>通过项目 GitHub 仓库提交 Issue 进行反馈；</li>
                <li>我们将在合理期限内对您的询问予以回复。</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
