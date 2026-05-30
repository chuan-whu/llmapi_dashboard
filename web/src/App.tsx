import './index.css';
import './App.css';
import { AppFooter } from './components/AppFooter';
import { UsagePage } from './pages/UsagePage';

function App() {
  return (
    <div className="app-frame">
      <main className="app-main">
        <UsagePage />
      </main>
      <AppFooter />
    </div>
  );
}

export default App;
