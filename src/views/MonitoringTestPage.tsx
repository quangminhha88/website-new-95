import { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Database, Brain, Clock, AlertTriangle } from 'lucide-react';

export default function MonitoringTestPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const runTest = async (name: string, endpoint: string) => {
    setLoading(name);
    const start = Date.now();
    try {
      const response = await fetch(endpoint);
      const data = await response.json().catch(() => ({ error: 'Raw response' }));
      const duration = Date.now() - start;
      
      setResults(prev => [{
        name,
        status: response.status,
        duration,
        data,
        timestamp: new Date().toLocaleTimeString()
      }, ...prev]);
    } catch (err) {
      setResults(prev => [{
        name,
        status: 'FAILED',
        error: String(err),
        timestamp: new Date().toLocaleTimeString()
      }, ...prev]);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b pb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="text-blue-600" />
            Monitoring System Test Suite
          </h1>
          <p className="text-gray-600 mt-2">
            Simulate system failures to verify Telegram alerts and logging.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <TestButton 
            title="Slow API (>5s)" 
            desc="Triggers latency alert in middleware"
            icon={<Clock size={20} />}
            onClick={() => runTest('Slow API', '/api/test/slow')}
            isLoading={loading === 'Slow API'}
          />
          <TestButton 
            title="DB Query Failure" 
            desc="Simulates missing table or syntax error"
            icon={<Database size={20} />}
            onClick={() => runTest('DB Failure', '/api/test/db-fail')}
            isLoading={loading === 'DB Failure'}
          />
          <TestButton 
            title="AI JSON Failure" 
            desc="Validates garbage text against schema"
            icon={<Brain size={20} />}
            onClick={() => runTest('AI Failure', '/api/test/ai-fail')}
            isLoading={loading === 'AI Failure'}
          />
          <TestButton 
            title="Internal Server Error" 
            desc="Triggers critical 500 alert"
            icon={<AlertTriangle size={20} />}
            onClick={() => runTest('500 Error', '/api/test/error-500')}
            isLoading={loading === '500 Error'}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50 font-medium">Test Logs</div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {results.length === 0 && (
              <div className="p-12 text-center text-gray-400">No tests run yet.</div>
            )}
            {results.map((res, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-gray-800">{res.name}</span>
                  <span className="text-xs text-gray-400">{res.timestamp}</span>
                </div>
                <div className="flex gap-4 text-xs font-mono">
                  <span className={res.status >= 400 || res.status === 'FAILED' ? 'text-red-500' : 'text-green-600'}>
                    Status: {res.status}
                  </span>
                  <span className="text-gray-500">Duration: {res.duration}ms</span>
                </div>
                {res.data && (
                  <pre className="mt-2 text-[10px] bg-gray-900 text-green-400 p-2 rounded max-h-24 overflow-auto">
                    {JSON.stringify(res.data, null, 2)}
                  </pre>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestButton({ title, desc, icon, onClick, isLoading }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={isLoading}
      className="flex items-start gap-4 p-4 border rounded-xl bg-white hover:border-blue-500 hover:shadow-md transition-all text-left disabled:opacity-50"
    >
      <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{desc}</p>
        {isLoading && <span className="text-xs text-blue-600 font-medium mt-1 inline-block animate-pulse">Running...</span>}
      </div>
    </button>
  );
}
