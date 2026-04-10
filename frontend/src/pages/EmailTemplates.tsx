import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Form, Button, Card, ListGroup, Table } from 'react-bootstrap';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';
import { IconCopy } from '../components/TableIcons';

interface TemplateMeta {
  type: string;
  language: string;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
}

interface TemplateVariable {
  variable: string;
  descriptionKey: string;
}

interface TemplateDetail {
  subject: string;
  body: string;
  name: string;
  language?: string;
  placeholders: string[];
  variables?: TemplateVariable[];
}

type TemplateLanguage = 'es' | 'en';

/** Barra completa: títulos, formato, listas, alineación, bloque cita, enlace e imagen. Imagen se inserta como data URL para que funcione en emails. */
const QUILL_MODULES = (() => {
  return {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ indent: '-1' }, { indent: '+1' }],
        [{ align: [] }],
        ['blockquote', 'code-block'],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: function (this: { quill: { getSelection: () => { index: number } | null; insertEmbed: (i: number, type: string, value: string) => void } }) {
          const input = document.createElement('input');
          input.setAttribute('type', 'file');
          input.setAttribute('accept', 'image/*');
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const q = this.quill;
              const range = q.getSelection();
              if (range) q.insertEmbed(range.index, 'image', dataUrl);
            };
            reader.readAsDataURL(file);
          };
          input.click();
        },
      },
    },
  };
})();

export default function EmailTemplates() {
  const t = useT();
  const [user, setUser] = useState<{ role: string } | null | undefined>(undefined);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<TemplateLanguage>('es');
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>('visual');
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const copyVariable = useCallback((variable: string) => {
    const text = `{{${variable}}}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<{ role: string }>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user?.role !== 'superuser') {
      setLoading(false);
      return;
    }
    api
      .get<{ templates: TemplateMeta[] }>('/api/blog/admin/email-templates')
      .then((res) => setTemplates(res.templates))
      .catch(() => setMessage({ type: 'error', text: t('emailTemplates.errorLoad') }))
      .finally(() => setLoading(false));
  }, [user, t]);

  useEffect(() => {
    if (!selectedType || user?.role !== 'superuser') return;
    setLoadingDetail(true);
    setMessage(null);
    api
      .get<TemplateDetail & { placeholders: string[]; variables?: TemplateVariable[] }>(
        `/api/blog/admin/email-templates/${encodeURIComponent(selectedType)}?language=${selectedLanguage}`
      )
      .then((res) => {
        setDetail(res);
        setSubject(res.subject);
        setBody(res.body ?? '');
        setEditorMode('visual');
      })
      .catch(() => setMessage({ type: 'error', text: t('emailTemplates.errorLoad') }))
      .finally(() => setLoadingDetail(false));
  }, [selectedType, selectedLanguage, user, t]);

  const handleSendTestEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo.trim()) return;
    setTestEmailMessage(null);
    setTestEmailSending(true);
    api
      .post<{ sent: boolean }>('/api/blog/admin/send-test-email', { to: testEmailTo.trim() })
      .then(() => {
        setTestEmailMessage({ type: 'success', text: t('emailTemplates.testEmailSent') });
        setTestEmailTo('');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : t('emailTemplates.testEmailError');
        setTestEmailMessage({ type: 'error', text: msg });
      })
      .finally(() => setTestEmailSending(false));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    setSaving(true);
    setMessage(null);
    api
      .put<TemplateMeta>(`/api/blog/admin/email-templates/${encodeURIComponent(selectedType)}`, {
        language: selectedLanguage,
        subject,
        body,
      })
      .then((updated) => {
        setMessage({ type: 'success', text: t('emailTemplates.saved') });
        setTemplates((prev) =>
          prev.map((tpl) =>
            tpl.type === selectedType && tpl.language === selectedLanguage
              ? { ...tpl, subject, body, name: updated.name, updated_at: updated.updated_at }
              : tpl
          )
        );
      })
      .catch(() => setMessage({ type: 'error', text: t('emailTemplates.errorSave') }))
      .finally(() => setSaving(false));
  };

  if (user === undefined || loading) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (user === null || user.role !== 'superuser') {
    return <Navigate to={user === null ? '/' : '/app'} replace />;
  }

  return (
    <main className="container py-4">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h4 mb-2">{t('emailTemplates.title')}</h1>
        <p className="text-muted small mb-2">{t('emailTemplates.intro')}</p>
        <p className="text-muted small mb-4">{t('emailTemplates.introLanguage')}</p>

        {message && (
          <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} py-2 mb-3`} role="alert">
            {message.text}
          </div>
        )}

        <Card className="mb-4 border-secondary bg-dark text-light">
          <Card.Header className="border-secondary py-2 small fw-semibold">{t('emailTemplates.testEmailTitle')}</Card.Header>
          <Card.Body className="py-3">
            <p className="text-muted small mb-2">{t('emailTemplates.testEmailIntro')}</p>
            <Form onSubmit={handleSendTestEmail} className="d-flex flex-wrap gap-2 align-items-end">
              <Form.Group className="flex-grow-1" style={{ minWidth: 200 }}>
                <Form.Control
                  type="email"
                  placeholder={t('emailTemplates.testEmailPlaceholder')}
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  className="bg-secondary text-light border-secondary"
                  disabled={testEmailSending}
                />
              </Form.Group>
              <Button type="submit" variant="primary" disabled={testEmailSending || !testEmailTo.trim()}>
                {testEmailSending ? t('common.loading') : t('emailTemplates.testEmailSend')}
              </Button>
            </Form>
            {testEmailMessage && (
              <div className={`alert alert-${testEmailMessage.type === 'success' ? 'success' : 'danger'} py-2 mt-2 mb-0 small`} role="alert">
                {testEmailMessage.text}
              </div>
            )}
          </Card.Body>
        </Card>

        <div className="row">
          <div className="col-md-4 mb-3">
            <Card className="border-secondary bg-dark text-light">
              <Card.Header className="border-secondary">{t('emailTemplates.typesTitle')}</Card.Header>
              <ListGroup variant="flush" className="bg-dark">
                {(() => {
                  const typeNames = new Map<string, string>();
                  for (const tpl of templates) {
                    if (!typeNames.has(tpl.type)) typeNames.set(tpl.type, tpl.name);
                  }
                  const uniqueTypes = Array.from(typeNames.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                  return uniqueTypes.map(([type, name]) => {
                    const isActive = selectedType === type;
                    return (
                      <ListGroup.Item
                        key={type}
                        action
                        active={isActive}
                        onClick={() => setSelectedType(type)}
                        className={isActive ? 'bg-info text-dark border-info' : 'bg-dark text-light border-secondary'}
                        style={{ cursor: 'pointer' }}
                      >
                        {name}
                      </ListGroup.Item>
                    );
                  });
                })()}
              </ListGroup>
            </Card>
          </div>
          <div className="col-md-8">
            {!selectedType ? (
              <p className="text-muted">{t('emailTemplates.intro')}</p>
            ) : loadingDetail ? (
              <p className="text-muted">{t('common.loading')}</p>
            ) : (
              <Card className="border-secondary bg-dark text-light">
                <Card.Header className="border-secondary d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <span>{detail?.name ?? selectedType}</span>
                  <div className="btn-group btn-group-sm" role="group" aria-label={t('nav.languageLabel')}>
                    <button
                      type="button"
                      className={`btn ${selectedLanguage === 'es' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSelectedLanguage('es')}
                    >
                      {t('nav.languageEs')}
                    </button>
                    <button
                      type="button"
                      className={`btn ${selectedLanguage === 'en' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSelectedLanguage('en')}
                    >
                      {t('nav.languageEn')}
                    </button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Form onSubmit={handleSave}>
                    {selectedType !== 'email_header' && selectedType !== 'email_footer' ? (
                      <Form.Group className="mb-3">
                        <Form.Label>{t('emailTemplates.subject')}</Form.Label>
                        <Form.Control
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="bg-secondary text-light border-secondary"
                        />
                      </Form.Group>
                    ) : null}
                    <Form.Group className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <Form.Label className="mb-0">{t('emailTemplates.body')}</Form.Label>
                        <Button
                          type="button"
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => setEditorMode((m) => (m === 'visual' ? 'html' : 'visual'))}
                        >
                          {editorMode === 'visual' ? t('emailTemplates.editHtml') : t('emailTemplates.viewVisual')}
                        </Button>
                      </div>
                      {editorMode === 'visual' ? (
                        <div className="email-template-editor">
                          <ReactQuill
                            theme="snow"
                            value={body}
                            onChange={setBody}
                            modules={QUILL_MODULES}
                            className="bg-transparent"
                          />
                        </div>
                      ) : (
                        <Form.Control
                          as="textarea"
                          rows={12}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          className="bg-secondary text-light border-secondary font-monospace small"
                          spellCheck={false}
                        />
                      )}
                    </Form.Group>
                    {detail?.variables && detail.variables.length > 0 ? (
                      <Card className="mb-3 email-templates-variables-card">
                        <Card.Header className="py-2 small fw-semibold">
                          {t('emailTemplates.variablesTitle')}
                        </Card.Header>
                        <Card.Body className="py-2 small">
                          <p className="email-templates-variables-intro mb-2">{t('emailTemplates.variablesIntro')}</p>
                          <Table size="sm" className="mb-0 email-templates-variables-table">
                            <thead>
                              <tr>
                                <th>{t('emailTemplates.columnVariable')}</th>
                                <th>{t('emailTemplates.columnDescription')}</th>
                                <th className="w-auto"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.variables.map((v) => (
                                <tr key={v.variable}>
                                  <td className="font-monospace">{`{{${v.variable}}}`}</td>
                                  <td className="email-templates-variables-desc">{t(v.descriptionKey)}</td>
                                  <td>
                                    <Button
                                      type="button"
                                      variant="info"
                                      size="sm"
                                      onClick={() => copyVariable(v.variable)}
                                      title={t('emailTemplates.copyVariable')}
                                    >
                                      <IconCopy />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </Card.Body>
                      </Card>
                    ) : null}
                    <Button type="submit" variant="primary" disabled={saving}>
                      {saving ? t('common.loading') : t('emailTemplates.save')}
                    </Button>
                  </Form>
                </Card.Body>
              </Card>
            )}
          </div>
        </div>
      </main>
  );
}
