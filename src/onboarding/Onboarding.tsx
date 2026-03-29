import React, { useState } from 'react';
import { PROVIDER_LIST } from '@providers/registry';
import type { ProviderConfig } from '@shared/types';
import { sendMessage } from '@shared/messages';
import { MSG } from '@shared/messages';
import { saveProvider, setActiveProvider, getSettings, saveSettings, generateId } from '@shared/storage';

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);

  const handleComplete = async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, onboardingComplete: true });
  };

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, 2));

  return (
    <div className="onboarding">
      <StepIndicator current={currentStep} />
      <div className="onboarding-card">
        {currentStep === 0 && <StepWelcome onNext={goNext} />}
        {currentStep === 1 && (
          <StepProvider
            onNext={async () => {
              await handleComplete();
              goNext();
            }}
            onSkip={async () => {
              await handleComplete();
              goNext();
            }}
          />
        )}
        {currentStep === 2 && <StepDone />}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="step-indicator">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`step-dot ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`} />
      ))}
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="step-content">
      <h1 className="step-title">Welcome to Immersive Reader</h1>
      <p className="step-subtitle">Listen to any web page with your own API keys</p>

      <div className="value-cards">
        <div className="value-card">
          <div className="value-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3>Bring Your Own Keys</h3>
          <p>Use OpenAI, ElevenLabs, Groq, or any OpenAI-compatible service</p>
        </div>

        <div className="value-card">
          <div className="value-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3>Privacy First</h3>
          <p>API keys stored locally, no data collection, fully open source</p>
        </div>

        <div className="value-card">
          <div className="value-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <h3>Karaoke-Style Reading</h3>
          <p>Word-by-word highlighting with auto-scroll as you listen</p>
        </div>
      </div>

      <button className="btn btn-primary btn-lg" onClick={onNext}>
        Get Started
      </button>
    </div>
  );
}

function StepProvider({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [providerId, setProviderId] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const selectedMeta = PROVIDER_LIST.find((p) => p.id === providerId);
  const isCustom = providerId === 'custom';

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    const config: ProviderConfig = {
      id: generateId(),
      providerId,
      name: selectedMeta?.name ?? providerId,
      apiKey: apiKey.trim(),
      baseUrl: isCustom && baseUrl.trim() ? baseUrl.trim() : undefined,
    };

    try {
      const result = await sendMessage<boolean>({
        type: MSG.VALIDATE_KEY,
        config,
      });

      if (result) {
        setTestResult('success');
        setTestMessage('Connection successful!');

        // Save provider and set as active
        await saveProvider(config);
        await setActiveProvider(config.id);
        setSaved(true);
      } else {
        setTestResult('error');
        setTestMessage('Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="step-content">
      <h1 className="step-title">Add Your First Provider</h1>
      <p className="step-subtitle">Connect a text-to-speech service to get started</p>

      <div className="provider-form">
        <label className="form-label">
          Provider
          <select
            className="form-select"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setTestResult(null);
              setTestMessage('');
              setSaved(false);
            }}
          >
            {PROVIDER_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {selectedMeta?.website && (
          <p className="provider-link">
            Get your API key at{' '}
            <a href={selectedMeta.website} target="_blank" rel="noopener noreferrer">
              {selectedMeta.name}
            </a>
          </p>
        )}

        {isCustom && (
          <label className="form-label">
            Base URL
            <input
              className="form-input"
              type="url"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
        )}

        <label className="form-label">
          API Key
          <input
            className="form-input"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
              setSaved(false);
            }}
          />
        </label>

        {testResult && (
          <div className={`test-result ${testResult}`}>
            {testResult === 'success' && (
              <svg className="test-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {testMessage}
          </div>
        )}

        <button
          className="btn btn-primary full-width"
          onClick={saved ? onNext : handleTest}
          disabled={testing || (!saved && !apiKey.trim())}
        >
          {testing ? 'Testing...' : saved ? 'Continue' : 'Test Connection'}
        </button>
      </div>

      <button className="skip-link" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}

function StepDone() {
  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleStartReading = () => {
    window.close();
  };

  return (
    <div className="step-content">
      <div className="done-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <h1 className="step-title">You're All Set!</h1>
      <p className="step-subtitle">Immersive Reader is ready to use</p>

      <div className="tips-card">
        <h3>Quick Tips</h3>
        <ul className="tips-list">
          <li>Click the extension icon or use the popup to start reading</li>
          <li>
            Use <kbd>Space</kbd> to play/pause, arrow keys to skip
          </li>
          <li>Customize highlighting colors and voice in Settings</li>
        </ul>
      </div>

      <div className="done-actions">
        <button className="btn btn-secondary" onClick={handleOpenSettings}>
          Open Settings
        </button>
        <button className="btn btn-primary" onClick={handleStartReading}>
          Start Reading
        </button>
      </div>
    </div>
  );
}
