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
import { useRegister } from '@/lib/api/hooks';
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

export default function RegisterScreen() {
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { mutate: register, isLoading, error } = useRegister();
  const { signIn } = useAuth();
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleRegister = async () => {
    setValidationError(null);
    setSignInError(null);

    if (!inviteCode.trim()) {
      setValidationError('Invite code is required');
      return;
    }

    if (!username.trim() || !password.trim()) {
      setValidationError('Username and password are required');
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }

    const result = await register({
      username: username.trim(),
      password,
      inviteCode: inviteCode.trim(),
    });

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

  const isDisabled =
    isLoading ||
    !inviteCode.trim() ||
    !username.trim() ||
    !password.trim() ||
    !confirmPassword.trim();

  const displayError = signInError || validationError || error;

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
                Driver Registration
              </CardTitle>
              <CardDescription className="text-center">
                Use your invite code to create an account
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
                <Label nativeID="inviteCode">Invite Code</Label>
                <Input
                  placeholder="Enter your invite code"
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  aria-labelledby="inviteCode"
                />
                <Text className="text-muted-foreground text-xs">
                  Get this from your company administrator
                </Text>
              </View>

              <View className="gap-2">
                <Label nativeID="username">Username</Label>
                <Input
                  ref={usernameRef}
                  placeholder="Choose a username"
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
                  placeholder="Create a password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!isLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  aria-labelledby="password"
                />
              </View>

              <View className="gap-2">
                <Label nativeID="confirmPassword">Confirm Password</Label>
                <Input
                  ref={confirmRef}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  aria-labelledby="confirmPassword"
                />
              </View>

              <Button
                onPress={handleRegister}
                disabled={isDisabled}
                className="mt-2"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className={buttonTextVariants({ variant: 'default' })}>
                    Create Account
                  </Text>
                )}
              </Button>

              <View className="mt-4 flex-row items-center justify-center gap-1">
                <Text className="text-muted-foreground text-sm">
                  Already have an account?
                </Text>
                <Link href={'/(auth)/login' as Href} asChild>
                  <Pressable>
                    <Text className="text-primary text-sm font-medium">
                      Sign In
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
