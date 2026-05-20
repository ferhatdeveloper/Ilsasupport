$path = Join-Path (Split-Path $PSScriptRoot -Parent) 'src\components\LoginPage.tsx'
$s = [IO.File]::ReadAllText($path)
$markerStart = '          {/* Geçici Web Giriş Formu - Sağda */}'
$markerForm = '            <form onSubmit={async (e) => {'
$markerEnd = '            <motion.div className="mt-6 pt-6 border-t'

$i0 = $s.IndexOf($markerStart)
if ($i0 -lt 0) { $markerStart = '          <div className="ilsa-surface rounded-2xl p-8 shadow-2xl">'; $i0 = $s.LastIndexOf($markerStart) }
$i1 = $s.IndexOf($markerForm, $i0)
$i2 = $s.IndexOf('            <div className="mt-6 pt-6 border-t', $i1)
if ($i0 -lt 0 -or $i1 -lt 0 -or $i2 -lt 0) { throw "Markers not found: $i0 $i1 $i2" }

$head = @'
          <div className="ilsa-surface rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="w-8 h-8 text-purple-400" />
              <h2 className="text-2xl ilsa-title">Giriş Yap</h2>
            </motion.div>

            {!showWebSignIn ? (
              <motion.div className="space-y-4">
                <motion.div className="flex justify-center">
                  <Monitor className="w-14 h-14 text-purple-400" />
                </motion.div>
                <p className="text-gray-600 dark:text-gray-300 text-sm text-center leading-relaxed">
                  Giriş yalnızca <strong>ILSA Support masaüstü</strong> uygulaması ile yapılır. Hesap bu bilgisayara kaydedilir.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  electron-client klasöründe npm install ve npm start
                </p>
              </motion.div>
            ) : (
              <>
            {allowWebSignIn && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4 text-center">
                Yönetici web girişi
              </p>
            )}

'@ -replace 'motion\.div','motion.div'

# Fix botched replace - write clean head
$head = @'
          <motion.div className="ilsa-surface rounded-2xl p-8 shadow-2xl">
'@
