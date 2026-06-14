import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Performer Lab runtime error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="runtime-error" role="alert">
          <section className="runtime-error__box">
            <h1>页面暂时无法继续分析</h1>
            <p>请刷新页面后重试。文件仍只在本地浏览器中处理，没有上传到服务器。</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
