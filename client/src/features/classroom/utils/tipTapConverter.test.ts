/**
 * tipTapConverter / tipTapImageUtils 单元测试
 * 覆盖：图片语法解析、[图:N] 标记替换、编号重映射、兜底插入
 */
import { describe, it, expect } from 'vitest';
import { markdownToTipTapJson } from './tipTapConverter';
import {
  resolveKeyframeMarkers,
  remapKeyframeMarkers,
  type KeyframeImageRef,
} from './tipTapImageUtils';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function parseDoc(json: string): TipTapNode[] {
  return (JSON.parse(json) as { content: TipTapNode[] }).content;
}

describe('markdownToTipTapJson 图片语法解析', () => {
  it('独立一行的 ![alt](src) 转为段落包裹的 image 节点', () => {
    const nodes = parseDoc(markdownToTipTapJson('![第1帧](keyframe://capture/s1/k1.jpg)'));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    const img = nodes[0].content?.[0];
    expect(img?.type).toBe('image');
    expect(img?.attrs).toEqual({ src: 'keyframe://capture/s1/k1.jpg', alt: '第1帧' });
  });

  it('图片行结束当前列表，且与标题/段落共存', () => {
    const md = '## 标题\n\n- 要点一\n\n![图](keyframe://capture/s/k.jpg)\n\n正文';
    const nodes = parseDoc(markdownToTipTapJson(md));
    expect(nodes.map((n) => n.type)).toEqual(['heading', 'bulletList', 'paragraph', 'paragraph']);
    expect(nodes[2].content?.[0].type).toBe('image');
  });

  it('行内混排的图片语法不作为图片节点处理', () => {
    const nodes = parseDoc(markdownToTipTapJson('前缀 ![图](http://x/y.jpg) 后缀'));
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].content?.[0].type).toBe('text');
  });
});

describe('resolveKeyframeMarkers 标记替换', () => {
  const keyframes: KeyframeImageRef[] = [
    { fileUrl: 'keyframe://capture/s/k1.jpg', relativeSeconds: 10 },
    { relativeSeconds: 70 }, // 无 fileUrl（保存失败）
    { fileUrl: 'keyframe://capture/s/k3.jpg', relativeSeconds: 200 },
  ];

  it('[图:N] 替换为对应帧的 Markdown 图片', () => {
    const result = resolveKeyframeMarkers('## A（00:10）\n\n[图:1]\n\n内容', keyframes);
    expect(result).toContain('![第1帧](keyframe://capture/s/k1.jpg)');
    expect(result).not.toContain('[图:1]');
  });

  it('无 fileUrl 或越界的标记被移除（优雅降级）', () => {
    const result = resolveKeyframeMarkers('[图:2]\n\n[图:9]\n\n正文', keyframes);
    expect(result).not.toContain('[图:');
    expect(result).not.toContain('![');
    expect(result).toContain('正文');
  });

  it('支持全角冒号与行内混排（图片另起一行）', () => {
    const result = resolveKeyframeMarkers('知识点说明 [图：3]', keyframes);
    const lines = result.split('\n');
    expect(lines[0]).toBe('知识点说明');
    expect(lines[1]).toBe('![第3帧](keyframe://capture/s/k3.jpg)');
  });

  it('存在标记时不触发兜底插入', () => {
    const md = '## A（00:10）\n\n[图:1]\n\n## B（03:20）\n\n内容';
    const result = resolveKeyframeMarkers(md, keyframes);
    // 仅有标记替换产生的 1 张图片，B 标题下不兜底插入
    expect(result.match(/!\[/g)).toHaveLength(1);
  });
});

describe('resolveKeyframeMarkers 兜底插入', () => {
  const keyframes: KeyframeImageRef[] = [
    { fileUrl: 'keyframe://capture/s/k1.jpg', relativeSeconds: 15 },
    { fileUrl: 'keyframe://capture/s/k2.jpg', relativeSeconds: 205 },
  ];

  it('整篇无标记时按时间就近在二级标题下插入图片', () => {
    const md = '## A（00:10）\n\n内容A\n\n## B（03:20）\n\n内容B';
    const result = resolveKeyframeMarkers(md, keyframes);
    const lines = result.split('\n');
    // A（10s）就近匹配 k1（15s），B（200s）就近匹配 k2（205s）
    expect(lines[lines.indexOf('## A（00:10）') + 2]).toBe('![第1帧](keyframe://capture/s/k1.jpg)');
    expect(lines[lines.indexOf('## B（03:20）') + 2]).toBe('![第2帧](keyframe://capture/s/k2.jpg)');
  });

  it('每帧最多使用一次，标题多于帧数时后续标题无图', () => {
    const md = '## A（00:10）\n\n## B（00:12）\n\n## C（00:14）';
    const result = resolveKeyframeMarkers(md, keyframes);
    expect(result.match(/!\[/g)).toHaveLength(2);
  });

  it('无时间标注的二级标题不插入；options 可关闭兜底', () => {
    const noTime = resolveKeyframeMarkers('## 无时间标题\n\n内容', keyframes);
    expect(noTime).not.toContain('![');
    const disabled = resolveKeyframeMarkers('## A（00:10）\n\n内容', keyframes, { fallbackInsert: false });
    expect(disabled).not.toContain('![');
  });

  it('全部帧无 fileUrl 时不插入', () => {
    const result = resolveKeyframeMarkers('## A（00:10）', [{ relativeSeconds: 5 }]);
    expect(result).toBe('## A（00:10）');
  });
});

describe('remapKeyframeMarkers 编号重映射', () => {
  it('批内局部编号映射为全局编号', () => {
    expect(remapKeyframeMarkers('[图:1] x [图:5]', 5, 5)).toBe('[图:6] x [图:10]');
  });

  it('越界编号被移除', () => {
    expect(remapKeyframeMarkers('[图:0][图:6]', 5, 5)).toBe('');
  });

  it('全角冒号同样重映射', () => {
    expect(remapKeyframeMarkers('[图：2]', 10, 5)).toBe('[图:12]');
  });
});

describe('标记替换 → TipTap 转换端到端', () => {
  it('替换后的 Markdown 可转出 image 节点', () => {
    const keyframes: KeyframeImageRef[] = [
      { fileUrl: 'keyframe://capture/s/k1.jpg', relativeSeconds: 0 },
    ];
    const md = resolveKeyframeMarkers('## 知识点（00:00）\n\n[图:1]', keyframes);
    const nodes = parseDoc(markdownToTipTapJson(md));
    const images = nodes.filter((n) => n.content?.[0]?.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].content?.[0].attrs?.src).toBe('keyframe://capture/s/k1.jpg');
  });
});
