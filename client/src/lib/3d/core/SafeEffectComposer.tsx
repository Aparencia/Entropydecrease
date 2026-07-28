/**
 * SafeEffectComposer — EffectComposer 的上下文安全包装
 *
 * postprocessing 的 EffectComposer.addPass 会读取 renderer.getContext().getContextAttributes().alpha，
 * 而 WebGL 规范规定上下文丢失时 getContextAttributes() 返回 null，
 * 此时直接挂载会抛 "Cannot read properties of null (reading 'alpha')" 并击穿整棵 React 树。
 *
 * 本包装在挂载前校验上下文活性，并监听 lost/restored 事件动态卸载/恢复后处理，
 * 保证后处理不可用时优雅降级为无特效渲染，而非白屏。
 */
import { EffectComposer } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { useEffect, useState, type ComponentProps } from 'react';

type SafeEffectComposerProps = ComponentProps<typeof EffectComposer>;

export function SafeEffectComposer({ children, ...props }: SafeEffectComposerProps) {
  const gl = useThree((s) => s.gl);
  const [ctxAlive, setCtxAlive] = useState(() => {
    const ctx = gl.getContext();
    return !!ctx && !ctx.isContextLost() && ctx.getContextAttributes() != null;
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = () => setCtxAlive(false);
    const onRestored = () => setCtxAlive(true);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);

  if (!ctxAlive) {
    console.warn('[3D] WebGL 上下文不可用，后处理已降级关闭');
    return null;
  }

  return <EffectComposer {...props}>{children}</EffectComposer>;
}
