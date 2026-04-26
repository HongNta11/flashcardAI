import { h, Component } from '/lib/preact.mjs';
import htm from '/lib/htm.mjs';

const html = htm.bind(h);

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return html`
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;gap:16px;text-align:center">
          <div style="font-size:3rem">⚠️</div>
          <p style="color:var(--wrong)">Something went wrong.</p>
          <button
            onClick=${() => location.reload()}
            style="padding:12px 24px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
          >Reload</button>
        </div>
      `;
    }
    return this.props.children;
  }
}
