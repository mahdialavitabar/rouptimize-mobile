import { Button, buttonTextVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useLogin } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth';
import { Link, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const { mutate: login, isLoading, error } = useLogin();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setSignInError(null);

    const result = await login({ username: username.trim(), password });
    if (result?.access_token && result?.refresh_token) {
      try {
        await signIn(result.access_token, result.refresh_token);
      } catch (e) {
        setSignInError(
          e instanceof Error ? e.message : 'Failed to process authentication',
        );
      }
    }
  };

  const isDisabled = isLoading || !username.trim() || !password.trim();
  const displayError = signInError || error;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="flex-1 items-center justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-center">
                Sign in to your account to continue
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-4">
              {displayError && (
                <View className="bg-destructive/10 border-destructive rounded-md border p-3">
                  <Text className="text-destructive text-sm">
                    {displayError}
                  </Text>
                </View>
              )}

              <View className="gap-2">
                <Label nativeID="username">Username</Label>
                <Input
                  placeholder="Enter your username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  aria-labelledby="username"
                />
              </View>

              <View className="gap-2">
                <Label nativeID="password">Password</Label>
                <Input
                  ref={passwordRef}
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  aria-labelledby="password"
                />
              </View>

              <Button
                onPress={handleLogin}
                disabled={isDisabled}
                className="mt-2"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className={buttonTextVariants({ variant: 'default' })}>
                    Sign In
                  </Text>
                )}
              </Button>

              <View className="mt-4 flex-row items-center justify-center gap-1">
                <Text className="text-muted-foreground text-sm">
                  Don&apos;t have an account?
                </Text>
                <Link href={'/(auth)/register' as Href} asChild>
                  <Pressable>
                    <Text className="text-primary text-sm font-medium">
                      Sign Up
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
