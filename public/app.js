const { useState, useEffect } = React;

const AtomicworkOutreachApp = () => {
    const [activeTab, setActiveTab] = useState('setup');
    const [userProfile, setUserProfile] = useState('');
    const [companyProfile, setCompanyProfile] = useState('');
    const [leadProfile, setLeadProfile] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    const handleAnalyze = async () => {
        if (!userProfile || !companyProfile || !leadProfile) {
            alert('Please provide your profile, the company profile, and the lead\'s profile.');
            return;
        }

        setIsAnalyzing(true);
        setAnalysis(null);
        setError(null);

        try {
            const response = await fetch('http://localhost:4000/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userProfile,
                    targetProfile: leadProfile,
                    knowledgeBase: companyProfile,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            setAnalysis(data);
        } catch (err) {
            console.error('Analysis error:', err);
            setError(err.message || 'Failed to analyze profiles');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    {/* Header with tabs */}
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Hyper-Contextual Outreach Engine</h1>
                                <p className="text-sm text-gray-500 mt-1">AI-Powered Personality & Context Analysis</p>
                            </div>
                        </div>
                        <div className="flex gap-2 border-b">
                            {[
                                { id: 'setup', label: 'Setup & Analysis' },
                                { id: 'results', label: 'Outreach Results' },
                                { id: 'knowledge', label: 'Knowledge & RAG' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors text-sm font-medium ${
                                        activeTab === tab.id 
                                            ? 'bg-blue-600 text-white' 
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {/* Setup Tab */}
                        {activeTab === 'setup' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Your Profile */}
                                    <div className="bg-gray-50 rounded-xl p-6">
                                        <h2 className="text-lg font-semibold mb-3 text-gray-700">Your Profile</h2>
                                        <textarea
                                            value={userProfile}
                                            onChange={(e) => setUserProfile(e.target.value)}
                                            placeholder="Paste your complete LinkedIn profile here..."
                                            className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    {/* Company Profile */}
                                    <div className="bg-gray-50 rounded-xl p-6">
                                        <h2 className="text-lg font-semibold mb-3 text-gray-700">Company Profile</h2>
                                        <textarea
                                            value={companyProfile}
                                            onChange={(e) => setCompanyProfile(e.target.value)}
                                            placeholder="Paste the company's complete LinkedIn profile here..."
                                            className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 text-sm"
                                        />
                                    </div>
                                    {/* Lead Profile */}
                                    <div className="bg-gray-50 rounded-xl p-6">
                                        <h2 className="text-lg font-semibold mb-3 text-gray-700">Lead's Profile</h2>
                                        <textarea
                                            value={leadProfile}
                                            onChange={(e) => setLeadProfile(e.target.value)}
                                            placeholder="Paste the lead's complete LinkedIn profile here..."
                                            className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-center">
                                    <button
                                        onClick={handleAnalyze}
                                        disabled={isAnalyzing}
                                        className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                                            isAnalyzing 
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        {isAnalyzing ? 'Analyzing...' : 'Generate Outreach'}
                                    </button>
                                </div>
                                {error && (
                                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                        {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results Tab */}
                        {activeTab === 'results' && (
                            <div className="space-y-6">
                                {analysis ? (
                                    <div className="space-y-6">
                                        {/* Lead's Personality Assessment */}
                                        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                                            <h2 className="text-lg font-semibold mb-4 text-gray-700">Lead's Personality Assessment</h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-600 mb-2">DISC Profile</div>
                                                    <div className="text-lg font-bold text-purple-600">
                                                        {analysis.leadPersona?.discProfile?.primary || 'N/A'}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Communication: {analysis.leadPersona?.discProfile?.communication || 'N/A'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-600 mb-2">Decision Style</div>
                                                    <div className="text-sm text-gray-700">
                                                        {analysis.leadPersona?.persona?.decisionStyle || 'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Company Research */}
                                        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                                            <h2 className="text-lg font-semibold mb-4 text-gray-700">Company Research</h2>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-600">Company Name</div>
                                                    <div className="text-lg font-bold text-blue-600">
                                                        {analysis.companyData?.name || 'N/A'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-600">Industry</div>
                                                    <div className="text-sm text-gray-700">
                                                        {analysis.companyData?.industry || 'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Outreach Messages */}
                                        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                                            <h2 className="text-lg font-semibold mb-4 text-gray-700">Personalized Outreach Messages</h2>
                                            <div className="space-y-6">
                                                {Object.entries(analysis.outreach || {}).map(([tone, messages]) => (
                                                    <div key={tone} className="border-l-4 border-blue-500 pl-4">
                                                        <h3 className="text-md font-semibold text-gray-700 mb-3 capitalize">{tone} Tone</h3>
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                            {Object.entries(messages || {}).map(([platform, content]) => (
                                                                <div key={platform} className="bg-gray-50 rounded-lg p-4">
                                                                    <div className="text-sm font-medium text-gray-700 mb-2 capitalize">{platform}</div>
                                                                    <div className="text-sm text-gray-600 mb-2">
                                                                        Subject: {content?.subject || 'N/A'}
                                                                    </div>
                                                                    <div className="text-sm text-gray-700 whitespace-pre-line">
                                                                        {content?.message || 'N/A'}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-gray-500">Please complete the setup and run analysis to see results</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Knowledge & RAG Tab */}
                        {activeTab === 'knowledge' && <KnowledgeRagPanel />}
                    </div>
                </div>
            </div>
        </div>
    );
};

// KnowledgeRagPanel component
const KnowledgeRagPanel = () => {
    // Dynamic API base URL - works in both development and production
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:4000'
        : window.location.origin;
    const [docs, setDocs] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const [title, setTitle] = useState('');
    const [tier, setTier] = useState('Platform');
    const [audience, setAudience] = useState(['General']);
    const [tagsInput, setTagsInput] = useState('');
    const [summary, setSummary] = useState('');
    const [body, setBody] = useState('');
    const [sourceType, setSourceType] = useState('narrative');
    const [isActive, setIsActive] = useState(true);

    const [ragPersonaRole, setRagPersonaRole] = useState('VP IT Ops');
    const [ragQuery, setRagQuery] = useState('L1/L2 value for IT Ops');
    const [ragTier, setRagTier] = useState('All');
    const [ragLoading, setRagLoading] = useState(false);
    const [ragResult, setRagResult] = useState(null);
    const [ragError, setRagError] = useState(null);

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState(null);
    const [uploadError, setUploadError] = useState(null);

    const allAudiences = ['CIO','CTO','CISO','VP_IT_Ops','ServiceDeskManager','SRE_Manager','ChangeManager','HRIT','Broad_Executive','General'];

    useEffect(() => {
        fetchDocs();
    }, []);

    const fetchDocs = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/api/atomicwork/knowledge`);
            if (!res.ok) throw new Error('Failed to load knowledge docs');
            const data = await res.json();
            setDocs(data.docs || []);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to load knowledge docs');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        // hard cap at 10 files
        const filesToSend = files.slice(0, 10);

        setUploading(true);
        setUploadError(null);
        setUploadMessage(null);

        try {
            const formData = new FormData();
            // backend expects field name "file" and supports multiples
            filesToSend.forEach((file) => {
                formData.append('file', file);
            });

            const res = await fetch('http://localhost:4000/api/atomicwork/knowledge/ingest', {
                method: 'POST',
                body: formData,
            });

            const contentType = res.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await res.json()
                : { error: `Unexpected response: ${await res.text()}` };

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Upload failed');
            }

            // Refresh docs so new ones show up
            await fetchDocs();

            if (Array.isArray(data.results)) {
                const successes = data.results.filter(
                    (r) => r.success && !r.deduped
                );
                const deduped = data.results.filter(
                    (r) => r.success && r.deduped
                );
                const failed = data.results.filter((r) => !r.success);

                let msgParts = [];
                if (successes.length) {
                    msgParts.push(
                        `Ingested ${successes.length} new doc(s): ${successes
                            .map((r) => `"${r.filename}"`)
                            .join(', ')}`
                    );
                }
                if (deduped.length) {
                    msgParts.push(
                        `Already ingested (${deduped.length}): ${deduped
                            .map((r) => `"${r.filename}"`)
                            .join(', ')}`
                    );
                }
                if (failed.length) {
                    msgParts.push(
                        `Failed (${failed.length}): ${failed
                            .map(
                                (r) =>
                                    `"${r.filename}" (${r.error || 'error'})` 
                            )
                            .join(', ')}`
                    );
                }

                setUploadMessage(msgParts.join(' | '));

                // auto-select first new doc so you can inspect it
                if (successes[0]?.doc?.id) {
                    setSelectedId(successes[0].doc.id);
                } else if (deduped[0]?.doc?.id) {
                    setSelectedId(deduped[0].doc.id);
                }
            } else if (data.doc) {
                // fallback in case backend still returns single doc
                setUploadMessage(
                    data.deduped
                        ? `Already ingested: "${data.doc.title}"` 
                        : `Ingested new doc: "${data.doc.title}"` 
                );
                if (data.doc.id) setSelectedId(data.doc.id);
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            // allow selecting same files again
            e.target.value = '';
        }
    };

    const resetForm = () => {
        setSelectedId(null);
        setTitle('');
        setTier('Platform');
        setAudience(['General']);
        setTagsInput('');
        setSummary('');
        setBody('');
        setSourceType('narrative');
        setIsActive(true);
        setMessage(null);
        setError(null);
    };

    const loadDocIntoForm = (doc) => {
        setSelectedId(doc.id);
        setTitle(doc.title || '');
        setTier(doc.tier || 'Platform');
        setAudience(doc.audience || ['General']);
        setTagsInput((doc.tags || []).join(', '));
        setSummary(doc.summary || '');
        setBody(doc.body || '');
        setSourceType(doc.sourceType || 'narrative');
        setIsActive(doc.isActive !== false);
        setMessage(null);
        setError(null);
    };

    const handleAudienceToggle = (a) => {
        setAudience(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
    };

    const handleSave = async () => {
        if (!title.trim() || !body.trim()) {
            setError('Title and body are required');
            return;
        }
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const payload = {
                title, tier, audience,
                tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
                summary, body, sourceType, isActive
            };
            let res;
            if (selectedId) {
                res = await fetch(`${API_BASE}/api/atomicwork/knowledge/${selectedId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${API_BASE}/api/atomicwork/knowledge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to save knowledge doc');
            }
            const data = await res.json();
            await fetchDocs();
            setMessage(selectedId ? 'Updated knowledge doc.' : 'Created new knowledge doc.');
            if (!selectedId) setSelectedId(data.doc.id);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to save knowledge doc');
        } finally {
            setSaving(false);
        }
    };

    const handleTestRag = async () => {
        setRagError(null);
        setRagResult(null);
        setRagLoading(true);
        try {
            const tiers = ragTier === 'All' ? [] : [ragTier];
            const res = await fetch(`${API_BASE}/api/atomicwork/knowledge/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: ragQuery,
                    persona: { role: ragPersonaRole },
                    context: { tiers, maxDocs: 5 }
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to query knowledge');
            }
            const data = await res.json();
            setRagResult(data);
        } catch (err) {
            console.error(err);
            setRagError(err.message || 'Failed to run RAG test');
        } finally {
            setRagLoading(false);
        }
    };

    const selectedDoc = selectedId ? docs.find(d => d.id === selectedId) : null;

    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-md">
                    {error}
                </div>
            )}
            {message && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-4 py-2 rounded-md">
                    {message}
                </div>
            )}

            {/* Upload Section */}
            <section className="bg-white rounded-xl shadow-sm p-4">
                <h2 className="font-semibold text-sm text-slate-800 mb-2">Upload Knowledge Document</h2>
                <p className="text-[11px] text-slate-500 mb-3">
                    Upload PDFs, text files, or audio/video to automatically extract and classify Atomicwork knowledge.
                </p>

                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                    <input
                        type="file"
                        id="file-upload"
                        multiple
                        accept=".txt,.md,.pdf,.mp3,.m4a,.wav,.mp4,.mov"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="hidden"
                    />
                    <label
                        htmlFor="file-upload"
                        className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            uploading
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {uploading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing Files…
                            </>
                        ) : (
                            <>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                </svg>
                                Choose Files or Drop Here (up to 10)
                            </>
                        )}
                    </label>
                    <p className="text-xs text-slate-400 mt-2">Supports PDF, TXT, MD, MP3, M4A, WAV, MP4, MOV (max 10MB per file)</p>
                    <p className="text-xs text-slate-400 mt-1">Select multiple files to batch upload. We'll show new vs already ingested vs failed.</p>
                </div>

                {uploadMessage && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-4 py-2 rounded-md">
                        {uploadMessage}
                    </div>
                )}
                {uploadError && (
                    <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-md">
                        {uploadError}
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* Left: list */}
                <section className="bg-white rounded-xl shadow-sm p-4 lg:h-[60vh] flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-semibold text-sm text-slate-800">Knowledge Docs</h2>
                        <button
                            onClick={resetForm}
                            className="text-[11px] px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
                        >
                            + New Doc
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {docs.length === 0 && !loading && (
                            <p className="text-xs text-slate-400">
                                No docs yet. Create your first Atomicwork narrative on the right.
                            </p>
                        )}
                        {docs.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => loadDocIntoForm(doc)}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-xs ${
                                    doc.id === selectedId
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="font-medium truncate">{doc.title}</div>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 ml-2">
                                        {doc.tier}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                    Aud: {(doc.audience || []).join(', ') || '—'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                    {(doc.tags || []).join(', ')}
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Middle+Right: form */}
                <section className="bg-white rounded-xl shadow-sm p-4 lg:col-span-2 lg:h-[60vh] flex flex-col">
                    <h2 className="font-semibold text-sm text-slate-800 mb-3">
                        {selectedId ? 'Edit Knowledge Doc' : 'New Knowledge Doc'}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
                        <div className="space-y-2">
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Title</label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="e.g. L1 Deflection via AI Search"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Tier</label>
                                <select
                                    value={tier}
                                    onChange={(e) => setTier(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="L1">L1</option>
                                    <option value="L2">L2</option>
                                    <option value="L3">L3</option>
                                    <option value="Multi">Multi</option>
                                    <option value="Platform">Platform</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Source Type</label>
                                <select
                                    value={sourceType}
                                    onChange={(e) => setSourceType(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="narrative">Narrative</option>
                                    <option value="internal_doc">Internal Doc</option>
                                    <option value="deck">Deck</option>
                                    <option value="faq">FAQ</option>
                                    <option value="email_snippet">Email Snippet</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <input
                                    id="isActive"
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="h-3 w-3"
                                />
                                <label htmlFor="isActive" className="text-[11px] text-slate-600">
                                    Active (included in RAG)
                                </label>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Target Audiences</label>
                                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto border border-slate-200 rounded-md p-2">
                                    {allAudiences.map(a => (
                                        <label key={a} className="flex items-center gap-1 text-[11px] text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={audience.includes(a)}
                                                onChange={() => handleAudienceToggle(a)}
                                                className="h-3 w-3"
                                            />
                                            <span>{a}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Tags (comma-separated)</label>
                                <input
                                    value={tagsInput}
                                    onChange={(e) => setTagsInput(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="e.g. ai_search, autonomy, iga, cmdl"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-600 mb-1">Summary (1–2 sentence TL;DR)</label>
                                <textarea
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-20"
                                    placeholder="Short, high-level summary for this doc..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <label className="block text-[11px] text-slate-600 mb-1">Body (full narrative / explanation)</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="flex-1 w-full px-2 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs resize-none"
                            placeholder="Paste the full Atomicwork narrative here (e.g. L1/L2/L3 analogy, value story, objection handling, etc.)"
                        />

                        <div className="mt-3 flex justify-between items-center">
                            <div className="text-[11px] text-slate-500 space-y-0.5">
                                {selectedDoc && (
                                    <>
                                        <div>Created: {new Date(selectedDoc.createdAt).toLocaleString()}</div>
                                        <div>Updated: {new Date(selectedDoc.updatedAt).toLocaleString()}</div>
                                        <div>
                                            Source:{' '}
                                            <span className="font-medium">
                                                {selectedDoc.sourceType || 'manual'}
                                            </span>
                                        </div>
                                        {selectedDoc.sourceMeta?.originalFilename && (
                                            <div>
                                                File:{' '}
                                                <span className="font-medium">
                                                    {selectedDoc.sourceMeta.originalFilename}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`text-xs px-4 py-1.5 rounded-md font-medium ${
                                    saving
                                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                            >
                                {saving ? 'Saving...' : (selectedId ? 'Save Changes' : 'Create Doc')}
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {/* RAG Test Panel */}
            <section className="bg-white rounded-xl shadow-sm p-4">
                <h2 className="font-semibold text-sm text-slate-800 mb-2">Test RAG Retrieval</h2>
                <p className="text-[11px] text-slate-500 mb-3">
                    Type a persona + query to see which Atomicwork docs your engine would use.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Persona Role</label>
                        <input
                            value={ragPersonaRole}
                            onChange={(e) => setRagPersonaRole(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="e.g. VP IT Ops, CIO, CISO"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-1">Query</label>
                        <input
                            value={ragQuery}
                            onChange={(e) => setRagQuery(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="e.g. L1/L2 value narrative for ticket deflection and automation"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Tier Filter</label>
                        <select
                            value={ragTier}
                            onChange={(e) => setRagTier(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="All">All</option>
                            <option value="L1">L1</option>
                            <option value="L2">L2</option>
                            <option value="L3">L3</option>
                            <option value="Multi">Multi</option>
                            <option value="Platform">Platform</option>
                        </select>
                    </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                        {ragError && <span className="text-red-600">{ragError}</span>}
                    </div>
                    <button
                        onClick={handleTestRag}
                        disabled={ragLoading}
                        className={`text-xs px-4 py-1.5 rounded-md font-medium ${
                            ragLoading
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                    >
                        {ragLoading ? 'Testing…' : 'Run RAG Test'}
                    </button>
                </div>

                {ragResult && (
                    <div className="mt-3 border-t border-slate-200 pt-3 text-xs">
                        <div className="text-[11px] text-slate-500 mb-2">
                            Query: <span className="font-medium">{ragResult.query}</span> | Persona:{' '}
                            <span className="font-medium">{ragResult.persona?.role || '—'}</span>
                        </div>
                        {ragResult.matchedDocs?.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {ragResult.matchedDocs.map(d => (
                                    <div key={d.id} className="border border-slate-200 rounded-md p-2 bg-slate-50">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="font-medium truncate">{d.title}</div>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                {d.tier}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 mb-0.5">
                                            Aud: {(d.audience || []).join(', ') || '—'}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mb-0.5">{d.summary}</div>
                                        {typeof d.score === 'number' && (
                                            <div className="text-[10px] text-slate-400">Score: {d.score.toFixed(2)}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400">
                                No docs matched this query. Try adjusting audience, tier, or adding more knowledge.
                            </p>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

ReactDOM.render(<AtomicworkOutreachApp />, document.getElementById('root'));
