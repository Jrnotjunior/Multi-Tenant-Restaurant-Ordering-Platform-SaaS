import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Isolate map-widget failures so a misconfigured map cannot eject the owner from Store Settings. */
export class MapPickerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Restaurant delivery map failed to render.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <div className="w2t-map-picker-crash" role="alert">
        <strong>The map is temporarily unavailable.</strong>
        <p>Your Store Settings page is still open. Check the map service configuration and try again.</p>
        <button type="button" onClick={() => this.setState({ hasError: false })}>Try map again</button>
      </div>;
    }
    return this.props.children;
  }
}
