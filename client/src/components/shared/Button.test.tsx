import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button 组件', () => {
  it('渲染默认按钮', () => {
    render(<Button>点击</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('点击');
  });

  it('渲染 primary 变体按钮', () => {
    render(<Button variant="primary">主要</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('主要');
  });

  it('渲染 ghost 变体按钮', () => {
    render(<Button variant="ghost">幽灵</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('幽灵');
  });

  it('渲染 danger 变体按钮', () => {
    render(<Button variant="danger">危险</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('危险');
  });

  it('loading 状态下显示 spinner 且按钮禁用', () => {
    render(<Button loading>加载中</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.querySelector('span')).toBeInTheDocument();
  });

  it('disabled 状态下按钮禁用', () => {
    render(<Button disabled>禁用</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('loading 优先级高于 disabled', () => {
    render(<Button loading disabled>加载中</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('应用自定义 className', () => {
    render(<Button className="custom-class">自定义</Button>);
    expect(screen.getByRole('button').className).toContain('custom-class');
  });
});
