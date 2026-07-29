/**
 * 用户协议页面
 *
 * @ai-context: 页面组件：TermsOfService。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function TermsOfService() {
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
            <FileText className="w-icon-xl h-icon-xl text-brand-500" />
            用户协议
          </h1>
          <p className="text-b3 text-text-tertiary mt-2">最后更新：2025-07-14</p>

          <div className="mt-kb-lg space-y-kb-md text-b1 text-text-secondary leading-relaxed">
            {/* 1. 协议总则 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">1. 协议总则</h2>
              <p className="mt-2">欢迎使用熵减（又名"课伴"，英文名 Entropy Decrease，以下简称"本软件"）。本用户协议（以下简称"本协议"）是您（以下简称"用户"）与本软件开发者之间关于使用本软件服务所订立的协议。</p>
              <p className="mt-2">使用本软件即表示您已阅读并同意本协议的全部条款。若您不同意本协议的任何内容，请立即停止使用并卸载本软件。</p>
            </section>

            {/* 2. 服务描述 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">2. 服务描述</h2>
              <p className="mt-2">本软件是一款面向个人学习者的桌面端学习辅助工具，提供的功能包括但不限于：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>深潜：</strong>专注计时与学习时段管理；</li>
                <li><strong>结礁：</strong>富文本编辑与内容组织；</li>
                <li><strong>反衰减呼吸：</strong>基于间隔重复算法的记忆训练；</li>
                <li><strong>浮出水面：</strong>辅助知识输出与理解评估；</li>
                <li><strong>AI 辅助功能：</strong>内容摘要生成、智能反衰减呼吸生成、浮出水面评估等（需联网）；</li>
                <li><strong>数据管理：</strong>本地存储、可选云端同步、数据导入导出。</li>
              </ul>
              <p className="mt-2">本软件仅供个人学习用途，不提供任何形式的商业服务。</p>
            </section>

            {/* 3. 使用规范 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">3. 使用规范</h2>
              <p className="mt-2">在使用本软件时，您应遵守以下规范：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>不得将本软件用于任何商业目的或营利性活动；</li>
                <li>不得将本软件用于违反中华人民共和国法律法规的任何用途；</li>
                <li>不得对本软件进行逆向工程、反编译、反汇编或以其他方式试图获取本软件的源代码；</li>
                <li>不得利用本软件从事危害网络安全、传播恶意代码或攻击其他系统的活动；</li>
                <li>不得将本软件用于收集、存储或处理他人个人信息；</li>
                <li>不得以任何方式规避或试图规避本软件的安全机制。</li>
              </ul>
            </section>

            {/* 4. 账号安全 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">4. 账号安全</h2>
              <p className="mt-2">若您使用需要账号登录的功能（如云端同步），请注意以下事项：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>您有责任妥善保管账号凭证（包括密码、Token 等），不得将其泄露给第三方；</li>
                <li>因您自身原因（包括但不限于密码泄露、设备丢失等）导致的账号安全问题，由您自行承担责任；</li>
                <li>若发现账号存在异常使用或安全漏洞，请立即更改密码并通过本协议末尾的联系方式通知我们；</li>
                <li>您不得将账号转让、出借或以其他方式提供给他人使用。</li>
              </ul>
            </section>

            {/* 5. 知识产权 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">5. 知识产权</h2>
              <h3 className="text-b1 font-medium text-text-primary mt-3">5.1 软件本身</h3>
              <p className="mt-2">本软件的代码、界面设计、图标、品牌标识等所有相关内容的知识产权归开发者所有，受相关法律法规保护。未经开发者书面授权，您不得复制、修改、分发本软件或其任何部分。</p>
              <h3 className="text-b1 font-medium text-text-primary mt-3">5.2 用户内容</h3>
              <p className="mt-2">您通过本软件创建的学习内容（包括但不限于笔记、闪卡、学习记录等）的知识产权归您所有。开发者不会对您的用户内容主张任何权利。</p>
              <h3 className="text-b1 font-medium text-text-primary mt-3">5.3 AI 生成内容</h3>
              <p className="mt-2">通过 AI 功能生成的内容（如摘要、闪卡建议、评估反馈等），在适用法律允许的范围内归您使用。但请注意，AI 生成内容可能涉及第三方 AI 服务商的使用条款，您应遵守相关条款。</p>
            </section>

            {/* 6. AI 生成内容声明 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">6. AI 生成内容声明</h2>
              <p className="mt-2">本软件集成的 AI 辅助功能所生成的内容（包括但不限于内容摘要、闪卡、评估反馈等）具有以下性质：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>AI 生成内容仅供参考，不构成任何形式的专业建议、学术结论或事实认定；</li>
                <li>AI 生成内容可能存在不准确、不完整或具有误导性的情况；</li>
                <li>您应对 AI 生成内容的准确性自行判断和验证，不应将其作为唯一依据；</li>
                <li>因依赖 AI 生成内容而做出的任何决策，其后果由您自行承担。</li>
              </ul>
            </section>

            {/* 7. 免责声明 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">7. 免责声明</h2>
              <p className="mt-2">在法律允许的最大范围内，本软件按"现状"提供，开发者作出以下免责声明：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>不提供任何形式的明示或暗示保证，包括但不限于对适销性、特定用途适用性、不侵权的保证；</li>
                <li>不保证本软件的运行将不会中断或完全无错误；</li>
                <li>不对因使用或无法使用本软件而产生的任何直接、间接、附带、特殊、惩罚性或后果性损害承担责任；</li>
                <li>不对因设备故障、操作系统问题、网络中断等不可控因素导致的服务异常承担责任；</li>
                <li>用户对自己的学习数据负有备份责任，因未备份导致的数据丢失由用户自行承担。</li>
              </ul>
            </section>

            {/* 8. 服务变更与终止 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">8. 服务变更与终止</h2>
              <h3 className="text-b1 font-medium text-text-primary mt-3">8.1 服务变更</h3>
              <p className="mt-2">开发者保留在不事先通知的情况下，对本软件进行更新、修改或暂停部分功能的权利。功能变更可能包括但不限于：新增功能、调整现有功能、修复缺陷等。</p>
              <h3 className="text-b1 font-medium text-text-primary mt-3">8.2 服务终止</h3>
              <p className="mt-2">您可随时通过卸载本软件终止使用。终止后：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>本地数据仍保留在您的设备上，您可自行处理；</li>
                <li>若已开启云端同步，云端数据将按照数据保留政策处理；</li>
                <li>本协议在终止后仍对终止前的行为具有约束力。</li>
              </ul>
            </section>

            {/* 9. 违规处理 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">9. 违规处理</h2>
              <p className="mt-2">若您违反本协议的任何条款，开发者有权根据违规情节采取以下一项或多项措施：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>向您发出警告通知；</li>
                <li>限制或暂停您使用部分功能（如云端同步、AI 辅助等）；</li>
                <li>终止您的账号及相关服务；</li>
                <li>追究法律责任。</li>
              </ul>
              <p className="mt-2">开发者有权根据实际情况自行判断违规行为的性质和严重程度，并采取相应的处理措施。</p>
            </section>

            {/* 10. 适用法律与争议解决 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">10. 适用法律与争议解决</h2>
              <p className="mt-2">本协议的订立、效力、解释、履行和争议解决均适用中华人民共和国法律（不包括港澳台地区法律）。</p>
              <p className="mt-2">因本协议产生的或与本协议相关的任何争议，双方应首先通过友好协商的方式解决。协商不成的，任何一方有权向开发者所在地有管辖权的人民法院提起诉讼。</p>
            </section>

            {/* 11. 协议更新 */}
            <section>
              <h2 className="text-h2 font-semibold text-text-primary">11. 协议更新</h2>
              <p className="mt-2">开发者保留在必要时对本协议进行更新或修改的权利。协议更新后：</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>更新后的协议将在本页面发布，并标注更新日期；</li>
                <li>重大变更将通过应用内通知的方式告知用户；</li>
                <li>更新生效后继续使用本软件，即视为您同意更新后的协议内容；</li>
                <li>若您不同意更新后的协议，请立即停止使用并卸载本软件。</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
